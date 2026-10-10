import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {stripTypeScriptTypes} from 'node:module';import vm from 'node:vm';
import {validPushSubscription,notificationPayload} from '../supabase/functions/commerce/push-policy.mjs';
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const row={id:id(1),lease:id(2),event_id:1,subscription_id:id(3),endpoint:'https://fcm.googleapis.com/test',p256dh:'a'.repeat(87),auth:'b'.repeat(22),business_name:'LG Estudio',token:id(4),status:'confirmed',confirmed_at:'2026-10-11T21:30:00Z',timezone:'America/Mazatlan'};
async function fixture({validTicket=true,sendError=null,active=true}={}){
 let handler,sends=[],calls=[],removed=false;
 const db={rpc:async(name,p)=>{calls.push({name,p});return {data:name==='commerce_push_consume_wake'?validTicket:name==='commerce_push_claim'?[row]:name==='commerce_push_subscription'?{subscribed:true}:name==='commerce_track'?{request:{id:id(1)},business_name:'LG Estudio'}:true}},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:active?{id:row.subscription_id}:null}),delete:()=>{removed=true;return q},then:resolve=>resolve({})};return q;}};
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret-not-for-pg-net',PUBLIC_APP_URL:'https://example.com/',VAPID_PUBLIC_KEY:'public',VAPID_PRIVATE_KEY:'private',VAPID_SUBJECT:'mailto:owner@example.com'};
 const src=(await readFile(new URL('../supabase/functions/commerce/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 vm.runInNewContext(stripTypeScriptTypes(src),{Deno:{env:{get:k=>env[k]},serve:fn=>{handler=fn}},createClient:()=>db,webpush:{setVapidDetails(){},async sendNotification(s,p){sends.push(JSON.parse(p));if(sendError)throw sendError;}},validPushSubscription,notificationPayload,URL,URLSearchParams,Request,Response,TextEncoder,crypto,console});
 return{handler,sends,calls,get removed(){return removed}};
}
const req=body=>new Request('https://example.supabase.co/functions/v1/commerce',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('Only one-use worker tickets can dispatch; delivery is accepted once with private link',async()=>{
 const no=await fixture({validTicket:false});assert.equal((await no.handler(req({action:'dispatch',ticket:id(9)}))).status,403);assert.equal(no.sends.length,0);
 const f=await fixture();assert.equal((await f.handler(req({action:'dispatch',ticket:id(9)}))).status,200);assert.equal(f.sends.length,1);assert(f.sends[0].url.endsWith('#seguimiento='+id(4)));assert(f.sends[0].body.includes('14:30'));assert.equal(f.calls.at(-1).p.result_status,'accepted');
});
test('Expired subscription removed; definite failures retry, uncertain sends do not auto-repeat',async()=>{
 for(const [error,expected] of [[{statusCode:410},'skipped'],[{statusCode:429},'failed'],[{statusCode:503},'uncertain'],[new Error('timeout'),'uncertain']]){const f=await fixture({sendError:error});await f.handler(req({action:'dispatch',ticket:id(9)}));assert.equal(f.calls.at(-1).p.result_status,expected);if(error.statusCode===410)assert(f.removed);}
 const f=await fixture({active:false});await f.handler(req({action:'dispatch',ticket:id(9)}));assert.equal(f.sends.length,0);
});
test('Subscription requires explicit consent and safe push provider; GET never changes a request',async()=>{
 const f=await fixture();for(const body of [{action:'subscribe',token:id(4),consent:false},{action:'subscribe',token:id(4),consent:true,subscription:{endpoint:'https://127.0.0.1/',keys:{p256dh:row.p256dh,auth:row.auth}}}])assert.equal((await f.handler(req(body))).status,400);
 assert.equal(f.calls.length,0);assert.equal((await f.handler(new Request('https://example.supabase.co/?action=cancel&token='+id(4)))).status,405);
 const manifest=await f.handler(new Request('https://example.supabase.co/?action=manifest&token='+id(4))),data=await manifest.json();assert.equal(data.start_url,'https://example.com/negocio.html#seguimiento='+id(4));assert.equal(data.id,'https://example.com/negocio.html?app='+id(1));
});
test('Notification does not expose private contact, delivery address, products or comments',()=>{
 const payload=notificationPayload({...row,contact:'secret-contact',address:'secret-address',comments:'secret-comments'},'https://example.com/');assert(!JSON.stringify(payload).includes('secret-'));
 assert.equal(new URL(payload.url).origin,'https://example.com');
});
