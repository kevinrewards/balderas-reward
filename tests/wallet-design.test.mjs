import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {renderArt,artOptions,iconFor} from '../supabase/functions/loyalty-v2/art.mjs';
import {walletProgress,walletPayload,validPushSubscription} from '../supabase/functions/loyalty-v2/policy.mjs';
const rows=[{available_visits:7,reward_id:'one',required_visits:5,reward_name:'20% de descuento'},{available_visits:7,reward_id:'two',required_visits:10,reward_name:'50% de descuento'}];
test('Rewards use available balance, with accurate partial/complete/empty states',()=>{
 assert.deepEqual(walletProgress(rows),{available:7,total:10,done:7,next:'50% de descuento · a las 10 visitas',ready:1});
 assert.equal(walletProgress(rows.map(r=>({...r,available_visits:2}))).ready,0);
 assert.equal(walletProgress(rows.map(r=>({...r,available_visits:12}))).done,10);
 assert.equal(walletProgress([{available_visits:0,reward_id:null}]).ready,0);
 assert.throws(()=>walletProgress([]));assert.throws(()=>walletProgress([{available_visits:'invalid'}]));
});
test('Image is a bounded valid PNG; snapshots differ and hostile parameters normalize',()=>{
 const png=renderArt({done:5,total:10}),view=new DataView(png.buffer);
 assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(view.getUint32(16),1032);assert.equal(view.getUint32(20),812);
 let pos=8,compressed;while(pos<png.length){const n=view.getUint32(pos),type=new TextDecoder().decode(png.slice(pos+4,pos+8));if(type==='IDAT')compressed=png.slice(pos+8,pos+8+n);pos+=n+12;}
 assert.equal(inflateSync(compressed).length,(1032*3+1)*812);
 assert.notDeepEqual(renderArt({done:0}),renderArt({done:10}));
 assert.equal(artOptions({total:Infinity,bg:'url(evil)',icon:'../file'}).total,10);
 assert.equal(artOptions({total:999999999,done:Infinity}).total,100000);
 assert.equal(iconFor('📸'),'camera');assert.equal(iconFor('☕'),'coffee');assert.equal(iconFor('🦄'),'star');
 for(const icon of ['star','camera','heart','coffee','gift'])assert(renderArt({icon}).length>100);
 assert(renderArt({total:100,done:30}).length>100);
});
async function fixture({missing=false,disabled=false}={}){
 const writes=[],dbCalls=[];let handler;
 const service={from(table){dbCalls.push(table);const data={customers:{id:'c-1',name:'Ana',business_id:'b-1',qr_token:'00000000-0000-0000-0000-000000000001',active:true},businesses:{id:'b-1',name:'LG Estudio',active:true},business_modules:{loyalty:!disabled,catalog:true,agenda:true},business_registration_links:{public_code:'public-business'},card_presentation:{program_name:'Club',primary_color:'#e1b85d',background_color:'#111112'},business_branding:{logo_path:null,progress_emoji:'📷'}}[table];const chain={select(){return chain},eq(){return chain},single:async()=>({data}),maybeSingle:async()=>({data})};return chain;},rpc:async name=>({data:name==='get_loyalty_card'?rows:[{progress_emoji:'📷'}]})};
 class JWT{setProtectedHeader(){return this}setIssuer(){return this}setAudience(){return this}setIssuedAt(){return this}setExpirationTime(){return this}async sign(){return 'test-jwt'}}
 const env={SUPABASE_URL:'https://project.supabase.co',PUBLIC_APP_URL:'https://example.com/',GOOGLE_WALLET_ISSUER_ID:'123',GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({private_key:'fake',client_email:'test@example.com'})};
 const fetch=async(url,opt={})=>{
  if(String(url).includes('oauth2'))return Response.json({access_token:'test-access'});
  if(opt.method==='POST'||opt.method==='PATCH'){writes.push({url,method:opt.method,body:JSON.parse(opt.body)});return Response.json({});}
  return new Response('{}',{status:missing?404:200});
 };
 let src=await readFile(new URL('../supabase/functions/loyalty-v2/index.ts',import.meta.url),'utf8');src=src.replace(/^import .+;\n/gm,'');
 const context={Deno:{env:{get:k=>env[k]},serve:fn=>{handler=fn}},createClient:()=>service,importPKCS8:async()=>({}),SignJWT:JWT,validPushSubscription,walletPayload,walletProgress,renderArt,iconFor,URL,URLSearchParams,Request,Response,Date,console,fetch};
 vm.runInNewContext(stripTypeScriptTypes(src),context);
 return {handler,writes,dbCalls};
}
const req=action=>new Request('https://project.supabase.co/functions/v1/loyalty-v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token:'00000000-0000-0000-0000-000000000001',available:9999})});
test('Refresh updates an existing pass from database, preserving QR and module links',async()=>{
 const f=await fixture(),r=await f.handler(req('refresh_wallet'));assert.equal(r.status,200);assert.deepEqual(await r.json(),{updated:true});
 assert.equal(f.writes.length,2);const object=f.writes[1].body;assert.equal(object.loyaltyPoints.balance.int,7);assert.equal(object.linksModuleData.uris.length,3);assert(object.barcode.value.includes('checkin.html'));
 const image=new URL(object.heroImage.sourceUri.uri);assert.equal(image.searchParams.get('icon'),'camera');assert(!image.href.includes('00000000'));assert(!image.href.includes('Ana'));assert.equal(image.searchParams.get('done'),'7');
});
test('Refresh never creates passes; disabled loyalty and unsupported methods remain blocked',async()=>{
 const f=await fixture({missing:true});assert.deepEqual(await(await f.handler(req('refresh_wallet'))).json(),{skipped:true});assert.equal(f.writes.length,0);
 const disabled=await fixture({disabled:true});assert.equal((await disabled.handler(req('refresh_wallet'))).status,400);assert.equal(disabled.writes.length,0);
 const result=await f.handler(new Request('https://project.supabase.co/?action=refresh_wallet&token=00000000-0000-0000-0000-000000000001'));assert.equal(result.status,405);
});
test('Public artwork needs no customer lookup; wallet save still produces the Google save URL',async()=>{
 const f=await fixture(),image=await f.handler(new Request('https://project.supabase.co/?action=art&done=5&total=10'));assert.equal(image.headers.get('content-type'),'image/png');assert.equal(f.dbCalls.length,0);
 assert.equal((await(await f.handler(req('wallet'))).json()).url,'https://pay.google.com/gp/v/save/test-jwt');
});
