import {createClient} from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import {validPushSubscription,notificationPayload} from './push-policy.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const uuid=(x:unknown)=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const env=(k:string)=>Deno.env.get(k)||'';
const pushReady=()=>!!(env('VAPID_PUBLIC_KEY')&&env('VAPID_PRIVATE_KEY')&&env('VAPID_SUBJECT'));
async function dispatch(db:any,ticket:string){
 const gate=await db.rpc('commerce_push_consume_wake',{ticket});
 if(gate.error||gate.data!==true)return reply(403,{error:'Envío no autorizado.'});
 if(!pushReady())return reply(503,{error:'Falta configurar las notificaciones.'});
 const base=env('PUBLIC_APP_URL');if(!base.startsWith('https://')||!base.endsWith('/'))return reply(503,{error:'Configura PUBLIC_APP_URL.'});
 const claim=await db.rpc('commerce_push_claim');if(claim.error)return reply(500,{error:'No se pudo consultar la cola.'});
 webpush.setVapidDetails(env('VAPID_SUBJECT'),env('VAPID_PUBLIC_KEY'),env('VAPID_PRIVATE_KEY'));
 const counts={processed:0,accepted:0,failed:0,uncertain:0};
 for(let offset=0;offset<claim.data.length;offset+=5)await Promise.all(claim.data.slice(offset,offset+5).map(async(row:any)=>{
  let status='uncertain';
  try{
   const active=await db.from('commerce_push_subscriptions').select('id').eq('id',row.subscription_id).maybeSingle();
   if(active.error)throw active.error;
   if(!active.data||!validPushSubscription({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}}))status='skipped';
   else{
    await webpush.sendNotification({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},JSON.stringify(notificationPayload(row,base)),{TTL:3600,timeout:8000});
    status='accepted';
   }
  }catch(error:any){
   if([404,410].includes(error.statusCode)){
    const removed=await db.from('commerce_push_subscriptions').delete().eq('id',row.subscription_id);status=removed.error?'failed':'skipped';
   }else status=error.statusCode&&error.statusCode<500?'failed':'uncertain';
  }
  const saved=await db.rpc('commerce_push_finish',{delivery:row.id,lease_value:row.lease,result_status:status});
  counts.processed++;if(saved.error)counts.uncertain++;else if(status==='accepted')counts.accepted++;else if(status==='failed')counts.failed++;else if(status==='uncertain')counts.uncertain++;
 }));
 return reply(200,counts);
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(!['GET','POST'].includes(req.method))return reply(405,{error:'Método no permitido.'});
 try{
  const raw=req.method==='POST'?await req.text():'';if(raw.length>16384)return reply(413,{error:'Solicitud demasiado grande.'});
  const body=req.method==='GET'?Object.fromEntries(new URL(req.url).searchParams):JSON.parse(raw);
  if(req.method==='GET'&&body.action!=='manifest')return reply(405,{error:'Usa POST.'});
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const db=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  let result;
  if(body.action==='dispatch'&&uuid(body.ticket))return await dispatch(db,body.ticket);
  if(body.action==='manifest'&&uuid(body.token)){
   const r=await db.rpc('commerce_track',{token:body.token,action:'get',expected_revision:null});if(r.error)return reply(404,{error:'Solicitud no encontrada.'});
   const base=env('PUBLIC_APP_URL');if(!base.startsWith('https://')||!base.endsWith('/'))return reply(503,{error:'Configura PUBLIC_APP_URL.'});
   const start=new URL('negocio.html',base);start.hash='seguimiento='+body.token;
   const id=new URL('negocio.html',base);id.searchParams.set('app',r.data.request.id);
   return new Response(JSON.stringify({id:id.href,name:r.data.business_name+' · Seguimiento',short_name:'Mi solicitud',start_url:start.href,scope:base,display:'standalone',background_color:'#f5f5f7',theme_color:'#111112',icons:[192,512].map(n=>({src:new URL('icons/icon-'+n+'.png',base).href,sizes:n+'x'+n,type:'image/png'}))}),{headers:{...cors,'Content-Type':'application/manifest+json'}});
  }
  if(['push_config','subscribe','unsubscribe'].includes(body.action)&&uuid(body.token)){
   if(body.action==='subscribe'&&(!pushReady()||body.consent!==true||!validPushSubscription(body.subscription)))return reply(400,{error:'Activa los permisos para recibir avisos de esta solicitud.'});
   const s=body.subscription;
   const subscription=body.action==='subscribe'?{endpoint:s.endpoint,p256dh:s.keys.p256dh,auth:s.keys.auth}:{endpoint:body.endpoint||''};
   result=await db.rpc('commerce_push_subscription',{token:body.token,action:body.action==='push_config'?'config':body.action,subscription});
   if(result.error)return reply(400,{error:result.error.code==='P0001'?result.error.message:'No se pudo configurar los avisos.'});
   return reply(200,{...result.data,push_ready:pushReady(),vapid_public_key:env('VAPID_PUBLIC_KEY')});
  }
  if(body.action==='submit'){
   if(!uuid(body.code)||!uuid(body.request_key)||body.website)return reply(400,{error:'Solicitud inválida.'});
   const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body.code+':'+ip));
   const hash=Array.from(new Uint8Array(signed),n=>n.toString(16).padStart(2,'0')).join('');
   result=await db.rpc('commerce_submit',{code:body.code,request_key_value:body.request_key,hash_value:hash,payload:body.payload||{}});
  }else if(['get','accept','change','cancel'].includes(body.action)&&uuid(body.token)){
   result=await db.rpc('commerce_track',{token:body.token,action:body.action,expected_revision:body.revision??null});
  }else return reply(400,{error:'Solicitud inválida.'});
  if(result.error)return reply(400,{error:result.error.code==='P0001'?result.error.message:'No se pudo completar la solicitud. Verifica los campos e intenta de nuevo.'});
  return reply(200,result.data);
 }catch{return reply(500,{error:'No se pudo completar la solicitud. Intenta nuevamente.'});}
});
