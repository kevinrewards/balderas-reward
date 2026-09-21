window.cardExperience=(()=>{
 const token=new URLSearchParams(location.search).get('token');
 const endpoint='https://aitupbowuekcfdqsksny.supabase.co/functions/v1/loyalty-v2';
 let deferred=null,registration=null,config=null,subscribed=false,initialized=false;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const msg=text=>{$('cardExperienceMessage').textContent=text;};
 async function api(action,extra={}){const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...extra})});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'No se pudo completar la solicitud.');return d;}
 function keyArray(s){const x=atob(s.replaceAll('-','+').replaceAll('_','/'));return Uint8Array.from(x,c=>c.charCodeAt(0));}
 function drawSubscription(){ $('cardPush').textContent=subscribed?'Dejar de recibir notificaciones':'Recibir promociones y novedades'; }
 async function init(){
  if(initialized)return;initialized=true;
  const r=await db.rpc('get_card_experience',{card_token:token});if(r.error||!r.data)return;
  const {design,campaigns}=r.data;
  if(design){
   document.body.style.background=design.background_color;
   document.documentElement.style.setProperty('--card-accent',design.primary_color);
   $('cardProgramName').textContent=design.program_name;$('cardWelcomeText').textContent=design.welcome_text;
   document.title=design.program_name+' | BALDERAS Reward';
   if(design.logo_url?.startsWith('https://')){ $('businessLogo').src=design.logo_url;$('businessLogo').alt=design.program_name;$('businessLogo').parentElement.hidden=false; }
  }
  $('cardCampaigns').innerHTML=(campaigns||[]).map(c=>`<article class="reward"><strong>${escapeHTML(c.title)}</strong><p>${escapeHTML(c.body)}</p><small>Vigente hasta ${escapeHTML(new Date(c.expires_at).toLocaleString('es-MX'))}</small></article>`).join('');
  $('cardExperience').hidden=false;
  if(location.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(location.hostname)){msg('Para instalar la tarjeta y activar notificaciones, abre su enlace HTTPS.');return;}
  try{
   config=await api('config');
   const manifest=document.createElement('link');manifest.rel='manifest';manifest.href=endpoint+'?action=manifest&token='+encodeURIComponent(token);document.head.appendChild(manifest);
   $('cardWallet').hidden=!config.wallet_ready;
   $('cardWallet').textContent=/Android/i.test(navigator.userAgent)?'Agregar a Google Wallet':'Google Wallet (para Android)';
   $('cardInstall').hidden=standalone();
   $('cardInstall').textContent=ios?'Instalar tarjeta en iPhone':'Instalar tarjeta';
   if('serviceWorker'in navigator){
    registration=await navigator.serviceWorker.register('card-sw.js',{scope:'./'});
    await navigator.serviceWorker.ready;
    const subscription=await registration.pushManager?.getSubscription();
    if(subscription)config=await api('config',{endpoint:subscription.endpoint});
   }
   subscribed=config.subscribed===true;drawSubscription();
   $('cardPush').hidden=!(registration&&config.push_ready&&'PushManager'in window&&'Notification'in window);
   if(ios&&!standalone())msg('En iPhone: abre en Safari, toca Compartir → Añadir a pantalla de inicio. Abre la tarjeta instalada para activar notificaciones.');
   else if(!config.push_ready)msg('Las notificaciones todavía no están disponibles para esta tarjeta.');
  }catch{msg('Puedes consultar tu tarjeta. La instalación, Wallet o las notificaciones aún no están disponibles.');}
 }
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;});
 $('cardInstall').onclick=async()=>{if(deferred){await deferred.prompt();deferred=null;}else msg(ios?'Safari → Compartir → Añadir a pantalla de inicio. No es Apple Wallet.':'Abre el menú de tu navegador y elige Instalar aplicación o Añadir a pantalla de inicio, si está disponible.');};
 $('cardWallet').onclick=async()=>{const b=$('cardWallet');b.disabled=true;try{const result=await api('wallet');const u=new URL(result.url);if(u.origin!=='https://pay.google.com')throw new Error('Enlace de Wallet inválido.');location.assign(u.href);}catch(e){msg(e.message);}finally{b.disabled=false;}};
 $('cardPush').onclick=async()=>{
  const b=$('cardPush');if(!registration||!config)return;
  if(ios&&!standalone()){msg('Primero añade esta tarjeta a la pantalla de inicio y ábrela desde allí.');return;}
  b.disabled=true;
  try{
   if(subscribed){const s=await registration.pushManager.getSubscription();if(s)await api('unsubscribe',{endpoint:s.endpoint});subscribed=false;msg('Ya no recibirás notificaciones de esta tarjeta en este dispositivo.');}
   else{
    // Permission request is made only in this explicit client click handler.
    const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('No se activaron las notificaciones. Puedes cambiar el permiso en los ajustes del navegador.');
    let s=await registration.pushManager.getSubscription();if(!s)s=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyArray(config.vapid_public_key)});
    await api('subscribe',{subscription:s.toJSON(),consent:true});subscribed=true;msg('Recibirás promociones y novedades de este negocio. Puedes cancelar aquí cuando quieras.');
   }drawSubscription();
  }catch(e){msg(e.message);}finally{b.disabled=false;}
 };
 return {init};
})();
if (!$('loyaltyCard').hidden) window.cardExperience.init().catch(()=>{});
