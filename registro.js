(()=>{
 const $=id=>document.getElementById(id),code=new URLSearchParams(location.search).get('negocio');
 const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
 const endpoint='https://aitupbowuekcfdqsksny.supabase.co/functions/v1/customer-registration';
 const status=text=>{$('registrationStatus').textContent=text};let busy=false,key=null;
 const pendingKey='balderas-registration-request:'+code,cardKey='balderas-registration-card:'+code;
 try{key=sessionStorage.getItem(pendingKey)}catch{}
 if(!uuid(key)){key=crypto.randomUUID();try{sessionStorage.setItem(pendingKey,key)}catch{}}
 function cardUrl(token){const u=new URL('card.html',location.href);u.search='';u.searchParams.set('token',token);return u.href;}
 async function api(body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,...body}),signal:controller.signal});
  const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'No se pudo completar la solicitud.');return d;
 }finally{clearTimeout(timer)}}
 $('registrationForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;const form=e.currentTarget;if(!form.reportValidity())return;
  const name=$('registrationName').value.trim(),email=$('registrationEmail').value.trim(),phone=$('registrationPhone').value.trim();
  if(name.length<2){status('Escribe tu nombre completo.');return;}
  const digits=phone.replace(/\D/g,'');if(phone&&(!/^[+0-9() .-]+$/.test(phone)||digits.length<7||digits.length>15)){status('Revisa el número de teléfono.');return;}
  busy=true;$('registrationSubmit').disabled=true;status('Creando tu tarjeta…');
  try{
   const result=await api({action:'register',request_id:key,name,email,phone,website:form.elements.website.value});
   if(!uuid(result.token))throw new Error('No se pudo abrir la tarjeta. Intenta nuevamente.');
   try{localStorage.setItem(cardKey,result.token);sessionStorage.removeItem(pendingKey)}catch{}
   location.replace(cardUrl(result.token));
  }catch(error){status(error.name==='AbortError'?'La conexión tardó demasiado. Puedes reintentar sin duplicar este registro.':error.message);busy=false;$('registrationSubmit').disabled=false;}
 });
 (async()=>{
  if(!uuid(code)){status('Este enlace no es válido. Escanea el QR de registro del negocio.');return;}
  try{
   const info=await api({action:'info'});$('registrationBusiness').textContent=info.name;document.title='Regístrate · '+info.name;
   if(info.logo_url?.startsWith('https://')){$('registrationLogo').src=info.logo_url;$('registrationLogo').alt='Logo de '+info.name;$('registrationLogo').hidden=false;}
   $('registrationForm').hidden=false;status('');
   let saved=null;try{saved=localStorage.getItem(cardKey)}catch{}
   if(uuid(saved)){$('existingCardLink').href=cardUrl(saved);$('existingCard').hidden=false;}
  }catch(error){status(error.name==='AbortError'?'No pudimos conectar. Recarga la página para reintentar.':error.message);}
 })();
})();
