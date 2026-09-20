import {createClient} from 'npm:@supabase/supabase-js@2';
import {importPKCS8,SignJWT} from 'npm:jose@5';
import webpush from 'npm:web-push@3.6.7';
import {validPushSubscription,walletPayload} from './policy.mjs';

const env=(key:string)=>Deno.env.get(key)||'';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),options);
const base=env('PUBLIC_APP_URL'); // HTTPS directory URL ending in /; never inferred from request headers.
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':'no-store'};
const reply=(status:number,data:unknown,type='application/json')=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':type}});
const pushReady=()=>!!(env('VAPID_PUBLIC_KEY')&&env('VAPID_PRIVATE_KEY')&&env('VAPID_SUBJECT'));
const walletReady=()=>!!(env('GOOGLE_WALLET_ISSUER_ID')&&env('GOOGLE_SERVICE_ACCOUNT_JSON'));

async function card(token:string){
 if(!/^[a-f0-9-]{36}$/i.test(token||''))throw new Error('Tarjeta inválida.');
 const c=await service.from('customers').select('id,name,business_id,qr_token,active').eq('qr_token',token).eq('active',true).single();
 if(c.error||!c.data)throw new Error('Tarjeta no disponible.');
 const b=await service.from('businesses').select('id,name,active').eq('id',c.data.business_id).eq('active',true).single();
 if(b.error||!b.data)throw new Error('Negocio no disponible.');
 const d=await service.from('card_presentation').select('*').eq('business_id',b.data.id).maybeSingle();
 if(d.error)throw new Error('No se pudo consultar el diseño.');
 return {customer:c.data,business:b.data,design:d.data};
}

async function googleAuth(){
 if(!walletReady())throw new Error('Google Wallet aún no está configurado.');
 const credentials=JSON.parse(env('GOOGLE_SERVICE_ACCOUNT_JSON'));
 const key=await importPKCS8(credentials.private_key,'RS256');
 const assertion=await new SignJWT({scope:'https://www.googleapis.com/auth/wallet_object.issuer'})
  .setProtectedHeader({alg:'RS256'}).setIssuer(credentials.client_email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(key);
 const authResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
 if(!authResponse.ok)throw new Error('Google no aceptó las credenciales de Wallet.');
 const auth=await authResponse.json();return {auth,key,credentials};
}
async function googleSave(context:any){
 const {auth,key,credentials}=await googleAuth();
 const payload=walletPayload({...context,issuer:env('GOOGLE_WALLET_ISSUER_ID'),base});
 for(const [resource,id,body] of [['loyaltyClass',payload.classId,payload.passClass],['loyaltyObject',payload.objectId,payload.passObject]] as const){
  const root=`https://walletobjects.googleapis.com/walletobjects/v1/${resource}`;
  const headers={Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'};
  const current=await fetch(`${root}/${id}`,{headers});
  if(current.status!==404&&!current.ok)throw new Error('No se pudo consultar el pase en Google Wallet.');
  const data:Record<string,unknown>={...body};
  if(current.ok&&resource==='loyaltyClass')delete data.reviewStatus;
  const saved=await fetch(current.status===404?root:`${root}/${id}`,{method:current.status===404?'POST':'PATCH',headers,body:JSON.stringify(data)});
  if(!saved.ok&&saved.status!==409)throw new Error('Google Wallet rechazó el pase. Revisa la cuenta de emisor y su aprobación.');
 }
 const jwt=await new SignJWT({iss:credentials.client_email,aud:'google',typ:'savetowallet',origins:[new URL(base).origin],payload:{loyaltyObjects:[{id:payload.objectId}]}}).setProtectedHeader({alg:'RS256'}).setIssuedAt().sign(key);
 return {url:`https://pay.google.com/gp/v/save/${jwt}`};
}

Deno.serve(async(request:Request)=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(!['GET','POST'].includes(request.method))return reply(405,{error:'Método no permitido.'});
 try{
  if(!base.startsWith('https://')||!base.endsWith('/'))throw new Error('Configura PUBLIC_APP_URL con HTTPS y / al final.');
  const url=new URL(request.url);
  const body=request.method==='GET'?Object.fromEntries(url.searchParams):await request.json();
  const action=body.action;
  if(['send','send_wallet','preview'].includes(action)){
   const user=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{...options,global:{headers:{Authorization:request.headers.get('Authorization')||''}}});
   const identity=await user.auth.getUser();
   if(identity.error||!identity.data.user)return reply(401,{error:'Inicia sesión.'});
   const campaign=await user.from('business_campaigns').select('*').eq('id',body.campaign_id).single();
   if(campaign.error||!campaign.data)return reply(403,{error:'No puedes administrar esta promoción.'});
   const permission=await user.rpc('can_manage_business_settings',{target_business_id:campaign.data.business_id});
   if(permission.error||permission.data!==true)return reply(403,{error:'Solo Owner del negocio o Superadmin.'});
   if(action==='preview'){
    const count=await service.from('card_push_subscriptions').select('id',{count:'exact',head:true}).eq('business_id',campaign.data.business_id);
    if(count.error)throw count.error;
    return reply(200,{subscriptions:count.count,push_ready:pushReady(),wallet_ready:walletReady()});
   }
   if(action==='send_wallet'){
    if(!walletReady())return reply(503,{error:'Google Wallet aún no está configurado.'});
    if(body.confirm!==true)return reply(400,{error:'Confirma el envío por Google Wallet.'});
    const {auth}=await googleAuth();
    const claim=await service.rpc('claim_wallet_campaign',{target_campaign:body.campaign_id,actor:identity.data.user.id});
    if(claim.error)throw claim.error;
    if(!claim.data.claimed)return reply(200,{message:claim.data.status==='accepted'?'Este aviso ya fue aceptado por Google Wallet.':'Este envío está en proceso o su resultado necesita revisión. No se repetirá automáticamente.'});
    const c=claim.data.campaign;const classId=`${env('GOOGLE_WALLET_ISSUER_ID')}.business_${c.business_id.replaceAll('-','')}`;
    try{
     const plain=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
     const response=await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${classId}/addMessage`,{method:'POST',headers:{Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({message:{id:`campaign_${c.id}`,header:plain(c.title),body:plain(c.body),messageType:'TEXT_AND_NOTIFY',displayInterval:{end:{date:c.expires_at}}}})});
     const status=response.ok?'accepted':response.status>=500?'uncertain':'failed';
     const saved=await service.from('campaign_wallet_dispatches').update({status}).eq('campaign_id',c.id);if(saved.error)throw saved.error;
     if(!response.ok)return reply(400,{error:response.status===404?'Todavía no existe un pase de este negocio en Google Wallet.':`Google Wallet no confirmó el aviso (${response.status}). Revisa la cuota y el estado del emisor.`});
     return reply(200,{message:'Google Wallet aceptó el mensaje. La alerta depende de los permisos del cliente y de Google.'});
    }catch{
     await service.from('campaign_wallet_dispatches').update({status:'uncertain'}).eq('campaign_id',c.id);
     return reply(503,{error:'El resultado del envío a Google es incierto. Revisa el pase antes de intentar otro mensaje; no lo reenviaremos automáticamente.'});
    }
   }
   if(!pushReady())return reply(503,{error:'Las notificaciones aún no están configuradas.'});
   if(body.confirm!==true)return reply(400,{error:'Confirma el envío a los clientes suscritos.'});
   const claimed=await service.rpc('claim_campaign_push',{target_campaign:body.campaign_id,actor:identity.data.user.id});
   if(claimed.error)throw claimed.error;
   webpush.setVapidDetails(env('VAPID_SUBJECT'),env('VAPID_PUBLIC_KEY'),env('VAPID_PRIVATE_KEY'));
   let accepted=0,failed=0;
   for(const s of claimed.data.subscriptions){
    const target=new URL('card.html',base);target.searchParams.set('token',s.token);
    try{
     if(!validPushSubscription({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}}))throw new Error('Endpoint inválido.');
     await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},JSON.stringify({title:claimed.data.campaign.title,body:claimed.data.campaign.body,url:target.href,tag:body.campaign_id}),{TTL:3600,timeout:5000});
     const saved=await service.from('campaign_push_deliveries').update({status:'accepted'}).eq('campaign_id',body.campaign_id).eq('subscription_id',s.id).eq('lease',claimed.data.lease);
     if(saved.error)throw saved.error;
     accepted++;
    }catch(error:any){
     failed++;
     if([404,410].includes(error.statusCode))await service.from('card_push_subscriptions').delete().eq('id',s.id);
     else await service.from('campaign_push_deliveries').update({status:'failed'}).eq('campaign_id',body.campaign_id).eq('subscription_id',s.id).eq('lease',claimed.data.lease);
    }
   }
   return reply(200,{accepted,failed,processed:claimed.data.subscriptions.length,message:'Aceptadas por el proveedor; no garantiza lectura. Pulsa de nuevo para procesar pendientes o reintentos.'});
  }
  if(!['config','manifest','subscribe','unsubscribe','wallet'].includes(action))return reply(400,{error:'Acción inválida.'});
  const context=await card(body.token);
  if(action==='config'){
   let subscribed=false;
   if(body.endpoint){const s=await service.from('card_push_subscriptions').select('id').eq('customer_id',context.customer.id).eq('endpoint',body.endpoint).maybeSingle();if(s.error)throw s.error;subscribed=!!s.data;}
   return reply(200,{push_ready:pushReady(),wallet_ready:walletReady(),vapid_public_key:env('VAPID_PUBLIC_KEY'),subscribed});
  }
  if(action==='manifest'){
   const start=new URL('card.html',base);start.searchParams.set('token',body.token);
   return reply(200,{id:start.href,name:context.design?.program_name||context.business.name,short_name:context.business.name.slice(0,24),start_url:start.href,scope:base,display:'standalone',background_color:context.design?.background_color||'#111112',theme_color:context.design?.primary_color||'#e1b85d',icons:[192,512].map(size=>({src:new URL(`icons/icon-${size}.png`,base).href,sizes:`${size}x${size}`,type:'image/png'}))},'application/manifest+json');
  }
  if(request.method!=='POST')return reply(405,{error:'Usa POST.'});
  if(action==='wallet')return reply(200,await googleSave(context));
  if(action==='unsubscribe'){
   const removed=await service.from('card_push_subscriptions').delete().eq('customer_id',context.customer.id).eq('endpoint',body.endpoint);
   if(removed.error)throw removed.error;return reply(200,{success:true});
  }
  if(!pushReady()||body.consent!==true||!validPushSubscription(body.subscription))return reply(400,{error:'Suscripción inválida o sin consentimiento.'});
  const count=await service.from('card_push_subscriptions').select('id',{count:'exact',head:true}).eq('customer_id',context.customer.id);
  if(count.error)throw count.error;
  if((count.count||0)>=10)return reply(400,{error:'Límite de dispositivos alcanzado para esta tarjeta.'});
  const s=body.subscription;
  const saved=await service.from('card_push_subscriptions').upsert({customer_id:context.customer.id,business_id:context.business.id,endpoint:s.endpoint,p256dh:s.keys.p256dh,auth:s.keys.auth},{onConflict:'customer_id,endpoint'});
  if(saved.error)throw saved.error;return reply(200,{success:true});
 }catch(error:any){return reply(400,{error:error.message||'No se pudo completar la solicitud.'});}
});
