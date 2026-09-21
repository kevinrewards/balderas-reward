window.customerExperience = (() => {
  const dialog=document.createElement('dialog');dialog.className='card experienceDialog';
  dialog.innerHTML=`<div class="sectionhead"><h2 id="experienceTitle">Tarjeta y promociones</h2><button id="experienceClose" type="button" class="secondary">Cerrar</button></div>
   <p>Administración exclusiva de Owner y Superadmin.</p>
   <details open><summary>Personalizar tarjeta</summary><form id="experienceDesign">
    <label>Nombre del programa<input name="program_name" maxlength="80" required></label>
    <label>Bienvenida<textarea name="welcome_text" maxlength="240"></textarea></label>
    <label>Color principal<input name="primary_color" type="color" value="#e1b85d"></label>
    <label>Fondo<input name="background_color" type="color" value="#111112"></label>
    <label>Enlace HTTPS del logotipo<input name="logo_url" type="url" placeholder="https://…"></label>
    <p class="muted">Los símbolos de visitas se cambian en Administrar recompensas.</p>
    <div id="experiencePreview" class="card">Vista previa</div><button type="submit">Guardar diseño</button></form></details>
   <details><summary>Nueva promoción o novedad</summary><form id="experienceCampaign">
    <label>Tipo<select name="kind"><option value="promotion">Promoción</option><option value="news">Novedad</option></select></label>
    <label>Título<input name="title" maxlength="80" required></label><label>Mensaje<textarea name="body" maxlength="500" required></textarea></label>
    <label>Vigente hasta (hora del dispositivo)<input name="expires_at" type="datetime-local" required></label><button type="submit">Guardar borrador</button></form></details>
   <div id="experienceCampaigns"></div><p id="experienceMessage" role="status"></p>`;
  dialog.setAttribute('aria-labelledby','experienceTitle');document.body.appendChild(dialog);
  let id=null,revision=0,busy=false;
  const message=()=>document.getElementById('experienceMessage');
  const design=()=>document.getElementById('experienceDesign');
  async function permission(bid){const r=await db.rpc('can_manage_business_settings',{target_business_id:bid});if(r.error||r.data!==true)throw new Error('Solo Owner de este negocio o Superadmin.');}
  function close(force=false){if(busy&&!force)return;++revision;id=null;dialog.close();}
  function sync(){ $('openCustomerExperience').hidden=!businessId||!(currentIsSuperAdmin||currentBusinessRole==='owner'); }
  function preview(){const f=design().elements,p=$('experiencePreview');p.style.background=f.background_color.value;p.style.color=f.primary_color.value;p.textContent=f.program_name.value+' · '+f.welcome_text.value;}
  async function campaigns(){
    const ticket=revision,bid=id;
    const r=await db.from('business_campaigns').select('id,title,body,kind,status,expires_at').eq('business_id',bid).order('created_at',{ascending:false}).limit(100);
    if(ticket!==revision)return;if(r.error)throw r.error;
    $('experienceCampaigns').innerHTML=(r.data||[]).map(c=>`<article class="businessAdminItem"><strong>${escapeHtml(c.title)}</strong><p>${escapeHtml(c.body)}</p><p>${{draft:'Borrador',published:'Publicada',archived:'Archivada'}[c.status]} · Hasta ${escapeHtml(new Date(c.expires_at).toLocaleString())}</p>
      ${c.status==='draft'?`<button data-campaign="${c.id}" data-action="publish">Publicar en las tarjetas</button>`:''}
      ${c.status==='published'?`<button data-campaign="${c.id}" data-action="send">Notificar a tarjetas instaladas / continuar envío</button><button class="secondary" data-campaign="${c.id}" data-action="send_wallet">Notificar por Google Wallet</button>`:''}
      ${c.status!=='archived'?`<button class="secondary" data-campaign="${c.id}" data-action="archive">Archivar</button>`:''}</article>`).join('')||'<p>No hay promociones o novedades.</p>';
  }
  async function open(bid,name){
    if(busy)return;close();const ticket=revision;id=bid;$('experienceTitle').textContent='Tarjeta y promociones · '+name;design().reset();$('experienceCampaigns').innerHTML='';dialog.showModal();message().textContent='Cargando…';
    for(const f of [design(),$('experienceCampaign')])for(const e of f.elements)e.disabled=true;
    try{
      await permission(bid);if(ticket!==revision)return;
      const r=await db.from('card_presentation').select('*').eq('business_id',bid).maybeSingle();
      if(ticket!==revision)return;if(r.error)throw r.error;
      design().reset();const values=r.data||{program_name:name};for(const [key,value]of Object.entries(values))if(design().elements.namedItem(key))design().elements.namedItem(key).value=value;
      preview();await campaigns();if(ticket!==revision)return;message().textContent='';
      for(const f of [design(),$('experienceCampaign')])for(const e of f.elements)e.disabled=false;
    }catch(error){if(ticket===revision)message().textContent=error.message;}
  }
  async function run(task){if(busy||!id)return;const ticket=revision,bid=id;busy=true;message().textContent='Guardando…';try{await permission(bid);if(ticket!==revision||!dialog.open)return;await task();if(ticket===revision)message().textContent=message().textContent==='Guardando…'?'Cambio guardado.':message().textContent;}catch(error){if(ticket===revision)message().textContent=error.message;}finally{busy=false;}}
  async function edge(body){const r=await db.functions.invoke('loyalty-v2',{body});if(r.error){let detail;try{detail=await r.error.context?.json();}catch{}throw new Error(detail?.error||'No se pudo completar la operación de notificaciones.');}if(r.data?.error)throw new Error(r.data.error);return r.data;}
  $('experienceClose').onclick=()=>close();dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  design().oninput=preview;
  design().onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(design()));run(async()=>{if(values.logo_url&&!String(values.logo_url).startsWith('https://'))throw new Error('El logotipo debe tener un enlace HTTPS.');const r=await db.rpc('save_card_presentation',{target_business_id:id,design:values});if(r.error)throw r.error;});};
  $('experienceCampaign').onsubmit=e=>{e.preventDefault();const content=Object.fromEntries(new FormData(e.target));run(async()=>{content.expires_at=new Date(content.expires_at).toISOString();const r=await db.rpc('manage_business_campaign',{target_business_id:id,action:'create',content});if(r.error)throw r.error;e.target.reset();await campaigns();});};
  $('experienceCampaigns').onclick=e=>{const b=e.target.closest('[data-campaign]');if(!b)return;const action=b.dataset.action,campaign_id=b.dataset.campaign;
    run(async()=>{
      if(action==='send_wallet'){
        const info=await edge({action:'preview',campaign_id});if(!info.wallet_ready)throw new Error('Google Wallet aún no está configurado.');
        if(!confirm('¿Enviar esta promoción por Google Wallet a quienes guardaron un pase de este negocio? Google limita las alertas y cada cliente debe permitirlas.')){message().textContent='Envío cancelado.';return;}
        const result=await edge({action:'send_wallet',campaign_id,confirm:true});message().textContent=result.message;
      }else if(action==='send'){
        const info=await edge({action:'preview',campaign_id});if(!info.push_ready)throw new Error('Las notificaciones aún no están configuradas.');
        if(!confirm(`¿Enviar esta promoción a los dispositivos suscritos de este negocio? Hay ${info.subscriptions} suscripciones. Se procesará un lote; los envíos ya aceptados no se repiten.`)){message().textContent='Envío cancelado.';return;}
        const result=await edge({action:'send',campaign_id,confirm:true});message().textContent=`Lote: ${result.accepted} aceptadas por el proveedor, ${result.failed} fallidas. ${result.processed===0?'No hay envíos disponibles en este momento.':result.message}`;
      }else{
        if(!confirm(action==='publish'?'¿Mostrar este mensaje en las tarjetas de los clientes de este negocio?':'¿Retirar este mensaje de las tarjetas?')){message().textContent='Cancelado.';return;}
        const r=await db.rpc('manage_business_campaign',{target_business_id:id,action,campaign_id});if(r.error)throw r.error;await campaigns();
      }
    });
  };
  $('openCustomerExperience').onclick=()=>open(businessId,$('biz').textContent);
  $('businessCustomerExperience').onclick=()=>{if(currentIsSuperAdmin&&selectedBusinessManage)open(selectedBusinessManage.businessId,selectedBusinessManage.businessName);};
  sync();return{open,close,sync};
})();
