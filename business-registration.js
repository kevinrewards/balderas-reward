(()=>{
 const $=id=>document.getElementById(id),dialog=document.createElement('dialog');dialog.className='registrationQrDialog';dialog.setAttribute('aria-labelledby','registrationQrTitle');
 dialog.innerHTML='<div class="sectionhead"><h2 id="registrationQrTitle">QR de registro</h2><button type="button" id="registrationQrClose" class="secondary">Cerrar</button></div><div class="registrationPrintBrand"><img id="registrationPrintLogo" alt="" hidden><h2 id="registrationPrintName"></h2><p>Escanea el QR y crea tu tarjeta de lealtad</p></div><p class="registrationStaffHint">Comparte este QR para que cada cliente cree su tarjeta. No registra visitas.</p><div id="businessRegistrationQR"></div><p id="registrationPrintUrl"></p><label for="businessRegistrationLink">Enlace público del negocio</label><input id="businessRegistrationLink" readonly><div class="qrActions"><button type="button" id="registrationCopy">Copiar enlace</button><button type="button" id="registrationDownload" class="secondary">Descargar QR</button><button type="button" id="registrationPrint" class="secondary">Imprimir</button><a id="registrationOpen" target="_blank" rel="noopener noreferrer">Abrir formulario</a></div><p id="registrationQrStatus" role="status"></p>';
 document.body.appendChild(dialog);
 const button=document.createElement('button');button.type='button';button.id='registrationMenu';button.hidden=true;
 button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM21 15v6h-6"/></svg><span>QR de registro</span>';
 const nav=document.querySelector('.workspaceSidebar nav');nav.insertBefore(button,nav.querySelector('.supportNav'));
 let revision=0,current=null;
 function sync(){
  button.hidden=!businessId||$('businessWorkspace').hidden||!(currentIsSuperAdmin||['owner','staff'].includes(currentBusinessRole));
  if(current!==businessId||button.hidden){++revision;dialog.close();current=businessId;}
 }
 function controls(disabled){for(const id of ['registrationCopy','registrationDownload','registrationPrint'])$(id).disabled=disabled;$('registrationOpen').hidden=disabled;}
 button.onclick=async()=>{
  sync();if(button.hidden)return;const bid=businessId,ticket=++revision;
  $('registrationPrintLogo').hidden=true;$('registrationPrintLogo').removeAttribute('src');$('registrationPrintName').textContent='';$('registrationPrintUrl').textContent='';$('registrationQrTitle').textContent='QR de registro';$('businessRegistrationQR').replaceChildren();$('businessRegistrationLink').value='';$('registrationOpen').removeAttribute('href');controls(true);$('registrationQrStatus').textContent='Cargando…';dialog.showModal();
  try{
   const r=await db.rpc('get_business_registration',{target_business_id:bid});if(ticket!==revision||!dialog.open||bid!==businessId)return;
   if(r.error||!r.data)throw new Error(r.error?.message||'No se pudo obtener el QR.');
   if(!/^[0-9a-f-]{36}$/i.test(r.data.code))throw new Error('Enlace de registro inválido.');
   const url=new URL('registro.html',location.href);url.search='';url.hash='';url.searchParams.set('negocio',r.data.code);
   $('registrationQrTitle').textContent='QR de registro · '+r.data.name;$('businessRegistrationLink').value=url.href;$('registrationOpen').href=url.href;
   new QRCode($('businessRegistrationQR'),{text:url.href,width:240,height:240,colorDark:'#1d1d1f',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
   $('registrationPrintName').textContent=r.data.name;$('registrationPrintUrl').textContent=url.href;
   let logoFailed=false;
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
   try{
    const response=await fetch('https://aitupbowuekcfdqsksny.supabase.co/functions/v1/customer-registration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'info',code:r.data.code}),signal:controller.signal});
    if(!response.ok)throw new Error('Logo no disponible');const info=await response.json();
    if(ticket!==revision||!dialog.open||bid!==businessId)return;
    if(info.logo_url){
     const logoUrl=new URL(info.logo_url);if(logoUrl.protocol!=='https:')throw new Error('Logo inválido');
     const loaded=new Image();loaded.src=logoUrl.href;
     await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Logo no disponible')),8000);loaded.decode().then(()=>{clearTimeout(timer);resolve()},()=>{clearTimeout(timer);reject(new Error('Logo no disponible'))})});
     if(ticket!==revision||!dialog.open||bid!==businessId)return;
     $('registrationPrintLogo').src=loaded.src;$('registrationPrintLogo').alt='Logo de '+r.data.name;$('registrationPrintLogo').hidden=false;
    }
   }catch{logoFailed=true}finally{clearTimeout(timeout)}
   if(ticket!==revision||!dialog.open||bid!==businessId)return;
   controls(false);$('registrationQrStatus').textContent=logoFailed?'No se pudo cargar el logo. Puedes imprimir con el nombre o cerrar y reabrir para reintentar.':'Puedes mostrarlo en el mostrador, imprimirlo o compartir el enlace.';
  }catch(error){if(ticket===revision)$('registrationQrStatus').textContent=error.message;}
 };
 $('registrationQrClose').onclick=()=>{++revision;dialog.close()};dialog.addEventListener('cancel',()=>++revision);
 $('registrationCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('businessRegistrationLink').value);$('registrationQrStatus').textContent='Enlace copiado.'}catch{$('businessRegistrationLink').focus();$('businessRegistrationLink').select();$('registrationQrStatus').textContent='Selecciona y copia el enlace mostrado.'}};
 $('registrationDownload').onclick=()=>{const canvas=$('businessRegistrationQR').querySelector('canvas'),img=$('businessRegistrationQR').querySelector('img');const source=canvas?.toDataURL('image/png')||img?.src;if(!source)return;const a=document.createElement('a');a.href=source;a.download='QR-registro-negocio.png';a.click()};
 $('registrationPrint').onclick=()=>window.print();
 const refresh=document.createElement('button');refresh.type='button';refresh.className='secondary compact';refresh.id='refreshClients';refresh.textContent='Actualizar clientes';refresh.onclick=async()=>{refresh.disabled=true;try{await load()}finally{refresh.disabled=false}};$('customers').closest('section').querySelector('.sectionhead').appendChild(refresh);
 const observer=new MutationObserver(sync);observer.observe($('biz'),{childList:true,characterData:true,subtree:true});for(const id of ['businessWorkspace','app','staffSection','superAdminSection'])observer.observe($(id),{attributes:true,attributeFilter:['hidden']});
 sync();
})();
