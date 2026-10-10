window.CommercePush=(()=>{
 const endpoint='https://aitupbowuekcfdqsksny.supabase.co/functions/v1/commerce';
 let current=null,registration=null,config=null,subscribed=false,closed=false,busy=false,deferred=null,revision=0;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const box=document.createElement('section');box.className='commerceForm';box.hidden=true;box.id='commercePush';
 box.innerHTML='<h2>Avisos de tu solicitud</h2><p>Recibe una notificación cuando el negocio confirme, cambie o cancele tu solicitud. Se activan solo para este dispositivo y esta solicitud.</p><div class="commerceActions"><button id="commercePushToggle" type="button" disabled>Recibir avisos de esta solicitud</button><button id="commercePushInstall" type="button" class="secondary">Instalar seguimiento</button></div><p id="commercePushMessage" role="status"></p>';
 document.getElementById('tracking').after(box);
 const $=id=>document.getElementById(id),message=text=>{$('commercePushMessage').textContent=text;};
 async function api(action,extra={},token=current){return window.Commerce.request({action,token,...extra});}
 function draw(){const b=$('commercePushToggle');b.textContent=subscribed?'Dejar de recibir estos avisos':'Recibir avisos de esta solicitud';b.disabled=busy||!config?.push_ready||!registration||(!subscribed&&closed);$('commercePushInstall').hidden=standalone();}
 function keyArray(s){return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
 async function mount({token,closed:done}){
  closed=done;if(current===token){draw();return}current=token;const ticket=++revision;config=null;subscribed=false;registration=null;box.hidden=false;draw();message('Preparando avisos…');
  let manifest=$('commerceManifest');if(!manifest){manifest=document.createElement('link');manifest.id='commerceManifest';manifest.rel='manifest';document.head.appendChild(manifest);}manifest.href=endpoint+'?action=manifest&token='+encodeURIComponent(token);
  try{
   if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw new Error(ios?'Para recibir avisos, abre el enlace en Safari, añádelo a la pantalla de inicio y entra desde ese icono.':'Este navegador no permite estos avisos. Conserva el enlace para consultar el estado.');
   const reg=await navigator.serviceWorker.register('card-sw.js',{scope:'./'});await navigator.serviceWorker.ready;
   const s=await reg.pushManager.getSubscription();const result=await api('push_config',{endpoint:s?.endpoint||''},token);if(ticket!==revision)return;
   registration=reg;config=result;subscribed=result.subscribed;
   message(!result.push_ready?'Los avisos todavía no están configurados.':ios&&!standalone()?'En Safari: Compartir → Añadir a pantalla de inicio. Abre el nuevo icono y activa los avisos.':subscribed?'Avisos activados para esta solicitud.':'Puedes activarlos aquí. Tu navegador te pedirá permiso.');draw();
  }catch(e){if(ticket===revision){message(e.message);draw()}}
 }
 $('commercePushToggle').onclick=async()=>{
  if(busy||!registration||!config)return;
  if(ios&&!standalone()){message('Añade primero este seguimiento a la pantalla de inicio y ábrelo desde allí.');return}
  const ticket=revision,token=current;busy=true;draw();
  try{
   if(subscribed){const s=await registration.pushManager.getSubscription();if(s)await api('unsubscribe',{endpoint:s.endpoint},token);if(ticket===revision){subscribed=false;message('Desactivaste los avisos de esta solicitud. Tus otras suscripciones se conservan.')}}
   else{
    const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('No se activaron los avisos. Puedes cambiar el permiso en la configuración del navegador.');
    let s=await registration.pushManager.getSubscription();if(!s)s=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyArray(config.vapid_public_key)});
    await api('subscribe',{subscription:s.toJSON(),consent:true},token);if(ticket===revision){subscribed=true;message('Avisos activados. Los próximos cambios llegarán a este dispositivo; su visualización depende de sus permisos y conexión.')}
   }
  }catch(e){if(ticket===revision)message(e.message)}finally{busy=false;draw()}
 };
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;});
 $('commercePushInstall').onclick=async()=>{if(deferred){await deferred.prompt();deferred=null}else message(ios?'Safari → Compartir → Añadir a pantalla de inicio. Después abre ese icono y activa los avisos.':'En el menú del navegador, elige Instalar aplicación o Añadir a pantalla de inicio si está disponible.');};
 return{mount};
})();
