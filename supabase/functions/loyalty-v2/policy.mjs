export function validPushSubscription(value) {
  try {
    const url=new URL(value.endpoint);
    const host=url.hostname;
    const allowed=host==='fcm.googleapis.com' || host==='updates.push.services.mozilla.com' || host.endsWith('.push.apple.com');
    return allowed && url.protocol==='https:' && !url.username && !url.password && !url.port && value.endpoint.length<=2000
      && /^[A-Za-z0-9_-]{80,100}$/.test(value.keys?.p256dh || '') && /^[A-Za-z0-9_-]{20,30}$/.test(value.keys?.auth || '');
  } catch {return false;}
}
export function walletProgress(rows) {
  if(!Array.isArray(rows)||!rows.length||!Number.isFinite(Number(rows[0].available_visits)))throw new Error('No se pudo consultar el saldo de visitas.');
  const available=Math.max(0,Math.floor(Number(rows[0].available_visits)));
  const rewards=rows.filter(r=>r.reward_id&&Number(r.required_visits)>0).sort((a,b)=>Number(a.required_visits)-Number(b.required_visits));
  const total=Math.max(10,...rewards.map(r=>Number(r.required_visits)));
  const next=rewards.find(r=>Number(r.required_visits)>available),ready=rewards.filter(r=>Number(r.required_visits)<=available);
  return {available,total,done:Math.min(available,total),next:next?`${next.reward_name} · a las ${next.required_visits} visitas`:rewards.length?'Todas las metas alcanzadas':'Consulta las recompensas del negocio',ready:ready.length};
}
export function walletPayload({issuer,customer,business,design,base,modules,portalCode,progress,artUrl,updatedAt}) {
  const classId=`${issuer}.business_${business.id.replaceAll('-','')}`;
  const objectId=`${issuer}.customer_${customer.id.replaceAll('-','')}`;
  const link=new URL('card.html',base);link.searchParams.set('token',customer.qr_token);
  const checkin=new URL('checkin.html',base);checkin.searchParams.set('token',customer.qr_token);
  const links=[{uri:link.href,description:'Ver visitas, recompensas y promociones',id:'live-card'}];
  if(portalCode){
    for(const [key,hash] of [['catalog','catalogo'],['agenda','solicitud']])if(modules?.[key]){
      const url=new URL('negocio.html',base);url.searchParams.set('negocio',portalCode);url.hash=hash;
      links.push({uri:url.href,description:modules[key+'_label']||(key==='catalog'?'Ver catálogo':'Pedidos y citas'),id:'business-'+key});
    }
  }
  return {classId,objectId,passClass:{id:classId,issuerName:business.name,programName:design?.program_name || business.name,
    reviewStatus:'UNDER_REVIEW',programLogo:{sourceUri:{uri:design?.logo_url || new URL('icons/icon-512.png',base).href}},
    hexBackgroundColor:design?.background_color || '#111112',accountNameLabel:'Cliente',
    ...(progress?{classTemplateInfo:{cardTemplateOverride:{cardRowTemplateInfos:[
      {twoItems:{startItem:{firstValue:{fields:[{fieldPath:"object.textModulesData['visit-count']"}]}},endItem:{firstValue:{fields:[{fieldPath:"object.textModulesData['goal']"}]}}}},
      {oneItem:{item:{firstValue:{fields:[{fieldPath:"object.textModulesData['next-reward']"}]}}}}
    ]}}}: {})},
    passObject:{id:objectId,classId,state:'ACTIVE',accountName:customer.name,barcode:{type:'QR_CODE',value:checkin.href,alternateText:'Muestra este QR en el negocio'},
    ...(progress?{loyaltyPoints:{label:'Visitas',balance:{int:progress.available}},
      ...(artUrl?{heroImage:{sourceUri:{uri:artUrl},contentDescription:{defaultValue:{language:'es',value:`${progress.done} de ${progress.total} visitas de progreso`}}}}:{})}:{}),
    linksModuleData:{uris:links},
    textModulesData:[...(progress?[
      {id:'visit-count',header:'Visitas',body:String(progress.available)},
      {id:'goal',header:'Meta de visitas',body:String(progress.total)},
      {id:'next-reward',header:'Próxima recompensa',body:progress.next},
      {id:'ready-rewards',header:'Recompensas disponibles',body:String(progress.ready)},
      {id:'last-update',header:'Última actualización del pase',body:updatedAt||'Consulta el saldo actual en tu tarjeta web.'}
    ]:[]),{id:'live-balance',header:'Tu tarjeta en línea',body:'Consulta el saldo actual, las recompensas y promociones en el enlace. Si el pase tarda en actualizarse, abre tu tarjeta y pulsa Actualizar pase guardado.'}]}};
}
