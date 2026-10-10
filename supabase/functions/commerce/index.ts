import {createClient} from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const uuid=(x:unknown)=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply(405,{error:'Método no permitido.'});
 try{
  const raw=await req.text();if(raw.length>16384)return reply(413,{error:'Solicitud demasiado grande.'});
  const body=JSON.parse(raw);
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const db=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  let result;
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
