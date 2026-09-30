import {createClient} from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply(405,{error:'Método no permitido.'});
 try{
  const raw=await req.text();if(raw.length>4096)return reply(413,{error:'Solicitud demasiado grande.'});
  const body=JSON.parse(raw);if(!uuid(body.code))return reply(400,{error:'El enlace de registro no es válido.'});
  const url=Deno.env.get('SUPABASE_URL')!,secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const l=await db.from('business_registration_links').select('business_id').eq('public_code',body.code).maybeSingle();
  if(l.error)throw new Error('No se pudo consultar el registro.');
  if(!l.data)return reply(404,{error:'Este registro no está disponible.'});
  const b=await db.from('businesses').select('name,active').eq('id',l.data.business_id).maybeSingle();
  if(b.error)throw new Error('No se pudo consultar el negocio.');
  if(!b.data?.active)return reply(404,{error:'Este negocio no está disponible.'});
  if(body.action==='info'){
   const branding=await db.from('business_branding').select('logo_path').eq('business_id',l.data.business_id).maybeSingle();
   if(branding.error)throw new Error('No se pudo consultar el diseño del negocio.');
   let logo=branding.data?.logo_path?db.storage.from('business-assets').getPublicUrl(branding.data.logo_path).data.publicUrl:'';
   if(!logo){
    const presentation=await db.from('card_presentation').select('logo_url').eq('business_id',l.data.business_id).maybeSingle();
    if(presentation.error)throw new Error('No se pudo consultar el logotipo de la tarjeta.');
    const saved=presentation.data?.logo_url;
    if(typeof saved==='string'&&saved.startsWith('https://'))logo=saved;
   }
   return reply(200,{name:b.data.name,logo_url:logo});
  }
  if(body.action!=='register'||!uuid(body.request_id))return reply(400,{error:'Solicitud inválida.'});
  if(body.website)return reply(400,{error:'No se pudo completar el registro.'});
  // HMAC avoids storing raw IP addresses. A per-business cap still applies regardless of headers.
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body.code+':'+ip));
  const hash=Array.from(new Uint8Array(signed),n=>n.toString(16).padStart(2,'0')).join('');
  const result=await db.rpc('register_public_customer',{registration_code:body.code,request_key:body.request_id,client_hash_value:hash,
   customer_name:typeof body.name==='string'?body.name:'',customer_email:typeof body.email==='string'?body.email:null,customer_phone:typeof body.phone==='string'?body.phone:null});
  if(result.error){
   // Business validation messages are safe; avoid exposing SQL/schema internals.
   const message=result.error.code==='P0001'?result.error.message:'No se pudo crear tu tarjeta. Pide ayuda al personal.';
   return reply(400,{error:message});
  }
  return reply(200,{token:result.data.token,created:result.data.created});
 }catch{return reply(500,{error:'No se pudo completar la solicitud. Intenta nuevamente.'});}
});
