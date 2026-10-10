(()=>{
 const C=window.Commerce,h=C.escape,$=id=>document.getElementById(id);
 const db=supabase.createClient('https://aitupbowuekcfdqsksny.supabase.co','sb_publishable_BuJU2ZgKkAcF39JpL_SaaA_oTmHfW9Z');
 const code=new URLSearchParams(location.search).get('negocio');let info=null,tracking=null,inflight=false,timer=null;
 const token=()=>new URLSearchParams(location.hash.slice(1)).get('seguimiento');
 const selected=()=>[...document.querySelectorAll('[data-quantity]')].map(el=>({id:el.dataset.quantity,quantity:Number(el.value)})).filter(x=>x.quantity>0);
 function catalog(){const q=$('catalogSearch').value.toLocaleLowerCase('es');const items=info.items.filter(i=>(i.name+' '+i.description+' '+i.category).toLocaleLowerCase('es').includes(q));$('publicItems').innerHTML=items.map(i=>'<article class="commerceItem">'+(C.safeImage(i.image_url)?'<img src="'+h(C.safeImage(i.image_url))+'" alt="" loading="lazy">':'')+'<small>'+h(i.category)+(i.featured?' · Destacado':'')+'</small><h3>'+h(i.name)+'</h3><p>'+h(i.description)+'</p><strong>'+h(C.money(i.price))+'</strong><p>'+(!i.available?'Agotado':i.kind==='service'?h(i.duration_minutes)+' minutos':'Disponible')+'</p></article>').join('')||'<p>No hay productos que coincidan.</p>';}
 function mode(){const m=$('requestMode').value;$('addressLabel').hidden=m!=='delivery';$('requestForm').elements.address.required=m==='delivery';$('partyLabel').hidden=!['reservation','dine_in'].includes(m);}
 async function load(){
  if(token()){await showTracking();return}
  if(!code)throw new Error('Este enlace de negocio no es válido.');
  const r=await db.rpc('commerce_public_info',{code});if(r.error)throw new Error('Este negocio no está disponible.');info=r.data;
  $('publicName').textContent=info.name;
  const logo=info.logo_path?db.storage.from('business-assets').getPublicUrl(info.logo_path).data.publicUrl:info.logo_url;
  if(C.safeImage(logo)){$('publicLogo').src=C.safeImage(logo);$('publicLogo').hidden=false;}
  const m=info.modules;let nav='';
  if(m.loyalty){const u=new URL('registro.html',location.href);u.searchParams.set('negocio',code);nav+='<a href="'+h(u.href)+'">'+h(m.loyalty_label)+' · Obtener tarjeta</a>'}
  if(m.catalog)nav+='<a href="#catalogo">'+h(m.catalog_label)+'</a>';
  if(m.agenda)nav+='<a href="#solicitud">'+h(m.agenda_label)+'</a>';
  $('publicNav').innerHTML=nav;$('catalogo').hidden=!m.catalog;$('solicitud').hidden=!m.agenda;
  $('catalogTitle').textContent=m.catalog_label;$('requestTitle').textContent=m.agenda_label;
  if(m.catalog)catalog();
  if(m.agenda){
   $('requestMode').innerHTML=m.modes.map(k=>'<option value="'+h(k)+'">'+h(C.modes[k])+'</option>').join('');
   $('requestTimezone').textContent='Horario del negocio: '+m.timezone+'. Déjalo vacío para acordarlo con el negocio.';
   $('requestProducts').innerHTML='<h3>Productos o servicios</h3>'+info.items.filter(i=>i.available).map(i=>'<label>'+h(i.name)+' · '+h(C.money(i.price))+'<input type="number" min="0" max="99" value="0" data-quantity="'+h(i.id)+'" aria-label="Cantidad de '+h(i.name)+'"></label>').join('')+'<small>Indica cantidades. Para una reservación puedes dejar todas en cero.</small>';
   mode();
  }
  if(!m.loyalty&&!m.catalog&&!m.agenda)$('publicMessage').textContent='Este negocio no tiene servicios en línea habilitados por el momento.';
  if(location.hash==='#solicitud'||location.hash==='#catalogo')document.querySelector(location.hash)?.scrollIntoView();
 }
 $('catalogSearch').addEventListener('input',catalog);$('requestMode').addEventListener('change',mode);
 $('requestForm').addEventListener('submit',async e=>{
  e.preventDefault();if(inflight)return;inflight=true;$('requestSubmit').disabled=true;$('requestMessage').textContent='Enviando…';
  try{
   const payload=Object.fromEntries(new FormData(e.target));const website=payload.website;delete payload.website;payload.items=selected();if(payload.requested_time&&!payload.requested_date)throw new Error('Selecciona una fecha para la hora solicitada.');payload.requested_at=payload.requested_time?payload.requested_date+'T'+payload.requested_time:'';delete payload.requested_time;if(!['reservation','dine_in'].includes(payload.mode))payload.party_size=1;
   if(payload.mode!=='reservation'&&!payload.items.length)throw new Error('Selecciona al menos un producto o servicio.');
   const signature=JSON.stringify(payload);let saved;try{saved=JSON.parse(sessionStorage.getItem('commerce-draft:'+code))}catch{}
   if(!saved||saved.signature!==signature)saved={signature,key:crypto.randomUUID()};sessionStorage.setItem('commerce-draft:'+code,JSON.stringify(saved));
   const r=await C.request({action:'submit',code,request_key:saved.key,payload,website});sessionStorage.removeItem('commerce-draft:'+code);
   location.hash='seguimiento='+r.token;$('catalogo').hidden=true;$('solicitud').hidden=true;$('publicNav').hidden=true;await showTracking();
  }catch(e){$('requestMessage').textContent=e.message}finally{inflight=false;$('requestSubmit').disabled=false}
 });
 async function showTracking(){
  clearTimeout(timer);const value=token();if(!value)return;
  try{
   const r=await C.request({action:'get',token:value});if(token()!==value)return;tracking=r;
   $('publicName').textContent=r.business_name;$('tracking').hidden=false;$('catalogo').hidden=true;$('solicitud').hidden=true;$('publicNav').hidden=true;$('publicMessage').textContent='';
   paintTracking();
  }catch(e){$('publicMessage').textContent=e.message+' Conserva este enlace y vuelve a intentar.'}
  finally{if(token()===value)timer=setTimeout(()=>{if(document.visibilityState==='visible')showTracking();else timer=setTimeout(showTracking,20000)},20000)}
 }
 function paintTracking(){const r=tracking.request,zone=tracking.timezone,closed=['completed','rejected','cancelled'].includes(r.status);
  window.CommercePush?.mount({token:token(),closed});
  $('tracking').innerHTML='<div class="commerceForm"><h2>'+h(C.states[r.status])+'</h2><p class="commercePill">Folio '+h(r.id.slice(0,8).toUpperCase())+'</p><p>'+h(C.modes[r.mode])+' · '+h(r.name)+'</p><p><strong>Horario solicitado:</strong> '+h(C.requested(r,zone))+'<br><strong>Horario confirmado:</strong> '+h(C.date(r.confirmed_at,zone))+'</p>'+(r.status==='pending'?'<p class="commerceNotice">El negocio aún no ha confirmado tu solicitud. No hay horario reservado.</p>':'')+(r.customer_response==='pending'?'<p class="commerceNotice">El negocio ajustó tu solicitud. Revisa el horario y los productos y confirma si estás de acuerdo.</p>':'')+(r.customer_response==='change_requested'?'<p class="commerceNotice">Solicitaste un cambio. El negocio revisará tu solicitud; el horario confirmado se conserva hasta que lo modifique o canceles.</p>':'')+'<p>'+r.items.map(i=>h(i.quantity+' × '+i.name+' · '+C.money(i.price))).join('<br>')+'</p>'+(r.address?'<p><strong>Dirección:</strong> '+h(r.address)+'</p>':'')+'<p><strong>Comentarios:</strong> '+h(r.comments||'Sin comentarios')+'</p><p><strong>Respuesta del negocio:</strong> '+h(r.business_note||'Sin notas')+'</p><div class="commerceActions">'+(!closed?((['confirmed','in_progress'].includes(r.status)?'<button data-response="accept">Aceptar confirmación</button>':'')+'<button data-response="change" class="secondary">Solicitar cambio</button><button data-response="cancel" class="secondary">Cancelar solicitud</button>'):'')+'<button id="refreshTracking" class="secondary">Actualizar estado</button><button id="copyTracking" class="secondary">Copiar enlace privado</button></div><p id="trackingMessage" role="status"></p><p><strong>Conserva este enlace privado.</strong> Esta página comprueba actualizaciones cada 20 segundos mientras está abierta. Puedes activar los avisos en este dispositivo en el apartado de abajo. No se envían por correo ni WhatsApp.</p><details><summary>Historial de cambios</summary>'+tracking.events.map(e=>'<p>'+h(C.date(e.created_at,zone))+' · '+h(e.actor)+'<br>'+h(C.states[e.snapshot.status])+' · '+h(C.date(e.snapshot.confirmed_at,zone))+(e.snapshot.business_note?'<br>'+h(e.snapshot.business_note):'')+'</p>').join('')+'</details></div>';
  $('refreshTracking').onclick=showTracking;$('copyTracking').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('trackingMessage').textContent='Enlace copiado.'}catch{$('trackingMessage').textContent='Copia la dirección de esta página desde tu navegador.'}};
 }
 $('tracking').addEventListener('click',async e=>{const b=e.target.closest('[data-response]');if(!b||inflight)return;const action=b.dataset.response;if(action==='cancel'&&!confirm('¿Cancelar esta solicitud?'))return;inflight=true;clearTimeout(timer);b.disabled=true;try{tracking=await C.request({action,token:token(),revision:tracking.request.revision});paintTracking()}catch(e){$('trackingMessage').textContent=e.message}finally{inflight=false;b.disabled=false;timer=setTimeout(showTracking,20000)}});
 load().catch(e=>{$('publicName').textContent='No disponible';$('publicMessage').textContent=e.message});
})();
