import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const business='00000000-0000-0000-0000-000000000001';
test('Business RLS reproduces failed logo; admin helper fixes upload/upsert without widening other roles',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA storage;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT CASE WHEN current_setting('test.actor',true) IS NOT NULL THEN '00000000-0000-0000-0000-000000000099'::uuid ELSE NULL END$$;
 GRANT USAGE ON SCHEMA public,storage,auth TO authenticated,anon;
 CREATE FUNCTION is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('test.actor',true)='superadmin'$$;
 CREATE TABLE businesses(id uuid PRIMARY KEY);ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;INSERT INTO businesses VALUES('${business}');GRANT SELECT ON businesses TO authenticated;
 CREATE TABLE business_branding(business_id uuid PRIMARY KEY,program_name text);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text UNIQUE);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE ON storage.objects TO authenticated;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20260930_business_setup_permissions.sql',import.meta.url),'utf8'));
 const as=async(actor,role='authenticated')=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('test.actor',$1,false)",[actor]);await db.exec('SET ROLE '+role)};
 for(const actor of ['owner','staff']){await as(actor);await assert.rejects(db.query('INSERT INTO business_branding VALUES($1,$2)',[business,'A']),/row-level security/);await assert.rejects(db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['business-assets',business+'/logo.png']),/row-level security/)}
 await as('superadmin');
 // Reproduce the production failure: the Superadmin has no SELECT policy on the new business.
 assert.equal((await db.query('SELECT * FROM businesses')).rows.length,0);
 await assert.rejects(db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['business-assets',business+'/logo.png']),/row-level security/);
 await db.exec('RESET ROLE');
 await db.exec(await readFile(new URL('../supabase/migrations/20260930_business_logo_rls.sql',import.meta.url),'utf8'));
 await as('superadmin');await db.query('INSERT INTO business_branding VALUES($1,$2)',[business,'A']);await db.query('INSERT INTO business_branding VALUES($1,$2) ON CONFLICT(business_id) DO UPDATE SET program_name=excluded.program_name',[business,'B']);
 await db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['business-assets',business+'/logo.png']);await db.query('UPDATE storage.objects SET name=$1 WHERE bucket_id=$2',[business+'/logo.webp','business-assets']);
 await assert.rejects(db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['private',business+'/file']),/row-level security/);
 await assert.rejects(db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['business-assets','nonexistent/logo.png']),/row-level security/);
 for(const actor of ['owner','staff']){
 await as(actor);assert.equal((await db.query('SELECT platform_admin_can_upload_business_logo($1,$2) AS allowed',['business-assets',business+'/logo.png'])).rows[0].allowed,false);
 await assert.rejects(db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['business-assets',business+'/other.png']),/row-level security/);
 }
 await as('staff');assert.equal((await db.query('UPDATE business_branding SET program_name=$1 RETURNING *',['bad'])).rows.length,0);
 await as('superadmin','anon');await assert.rejects(db.query('INSERT INTO business_branding VALUES($1,$2)',[business,'C']),/permission denied/);
 }finally{await db.close()}
});
