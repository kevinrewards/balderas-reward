import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
test('Public registration: tenant scope, role checks, retry safety, validation and rate limits',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 CREATE TABLE businesses(id uuid PRIMARY KEY,name text,active boolean);
 CREATE TABLE platform_admins(user_id uuid);CREATE TABLE business_members(business_id uuid,user_id uuid,role text,active boolean);
 CREATE TABLE customers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid REFERENCES businesses(id),qr_token uuid DEFAULT gen_random_uuid(),name text,email text,phone text,active boolean DEFAULT true);
 CREATE TABLE visits(id uuid DEFAULT gen_random_uuid(),customer_id uuid);
 INSERT INTO businesses VALUES('${id(1)}','A',true),('${id(2)}','B',true),('${id(3)}','Disabled',false);
 INSERT INTO business_members VALUES('${id(1)}','${id(11)}','owner',true),('${id(1)}','${id(12)}','staff',true),('${id(1)}','${id(13)}','staff',false);
 INSERT INTO platform_admins VALUES('${id(14)}');`);
 const migration=await readFile(new URL('../supabase/migrations/20260930_public_registration.sql',import.meta.url),'utf8');await db.exec(migration);
 const links=(await db.query('SELECT business_id,public_code FROM business_registration_links ORDER BY business_id')).rows;
 assert.equal(new Set(links.map(x=>x.public_code)).size,3);
 await db.query('INSERT INTO businesses VALUES($1,$2,true)',[id(4),'New']);assert.equal((await db.query('SELECT count(*) AS n FROM business_registration_links')).rows[0].n,4);
 const as=async(user,role='authenticated')=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec('SET ROLE '+role)};
 for(const user of [id(11),id(12),id(14)]){await as(user);assert.equal((await db.query('SELECT get_business_registration($1) AS d',[id(1)])).rows[0].d.code,links[0].public_code)}
 await as(id(12));await assert.rejects(db.query('SELECT get_business_registration($1)',[id(2)]),/No tienes acceso/);
 await as(id(13));await assert.rejects(db.query('SELECT get_business_registration($1)',[id(1)]),/No tienes acceso/);
 await as(null,'anon');await assert.rejects(db.query('SELECT * FROM business_registration_links'),/permission denied/);await assert.rejects(db.query('SELECT get_business_registration($1)',[id(1)]),/permission denied/);
 const params=[links[0].public_code,id(100),'a'.repeat(64),'Ana Pérez','ana@example.com','+52 669 123 4567'];
 const sql='SELECT register_public_customer($1,$2,$3,$4,$5,$6) AS d';
 await assert.rejects(db.query(sql,params),/permission denied/);
 await as(id(11));await assert.rejects(db.query(sql,params),/permission denied/);
 await as(null,'service_role');const first=(await db.query(sql,params)).rows[0].d;const second=(await db.query(sql,params)).rows[0].d;assert.equal(first.created,true);assert.equal(second.created,false);assert.equal(second.token,first.token);
 await assert.rejects(db.query(sql,[links[2].public_code,...params.slice(1)]),/no disponible/);
 await assert.rejects(db.query(sql,[...params.slice(0,3),'',null,null]),/nombre/);
 await assert.rejects(db.query(sql,[...params.slice(0,4),'bad@email','1234567']),/correo/);
 await assert.rejects(db.query(sql,[...params.slice(0,5),'123']),/teléfono/);
 const optional=(await db.query(sql,[links[1].public_code,id(101),'b'.repeat(64),'Luis',null,null])).rows[0].d;assert.notEqual(optional.token,first.token);
 await db.exec('RESET ROLE');const stored=(await db.query('SELECT * FROM customers WHERE qr_token=$1',[first.token])).rows[0];assert.equal(stored.business_id,id(1));assert.equal(stored.email,'ana@example.com');assert.equal((await db.query('SELECT count(*) AS n FROM visits')).rows[0].n,0);
 // At the per-source limit a retry succeeds, but a new registration cannot exceed it.
 for(let n=0;n<29;n++)await db.query('INSERT INTO customer_registration_requests VALUES($1,$2,$3,$4,now())',[id(1),id(200+n),stored.id,'a'.repeat(64)]);
 await as(null,'service_role');await assert.rejects(db.query(sql,[links[0].public_code,id(999),'a'.repeat(64),'Luis',null,null]),/muchos registros/);
 assert.equal((await db.query(sql,params)).rows[0].d.token,first.token);
 // A disabled business does not permit replaying a successful registration either.
 await db.exec('RESET ROLE');await db.query('UPDATE businesses SET active=false WHERE id=$1',[id(1)]);await as(null,'service_role');await assert.rejects(db.query(sql,params),/no disponible/);
 }finally{await db.close()}
});
