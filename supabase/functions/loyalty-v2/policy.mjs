export function validPushSubscription(value) {
  try {
    const url=new URL(value.endpoint);
    const host=url.hostname;
    const allowed=host==='fcm.googleapis.com' || host==='updates.push.services.mozilla.com' || host.endsWith('.push.apple.com');
    return allowed && url.protocol==='https:' && !url.username && !url.password && !url.port && value.endpoint.length<=2000
      && /^[A-Za-z0-9_-]{80,100}$/.test(value.keys?.p256dh || '') && /^[A-Za-z0-9_-]{20,30}$/.test(value.keys?.auth || '');
  } catch {return false;}
}
export function walletPayload({issuer,customer,business,design,base,modules,portalCode}) {
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
    hexBackgroundColor:design?.background_color || '#111112'},
    passObject:{id:objectId,classId,state:'ACTIVE',accountName:customer.name,barcode:{type:'QR_CODE',value:checkin.href},
    linksModuleData:{uris:links},
    textModulesData:[{id:'live-balance',header:'Tus visitas y recompensas',body:'Abre el enlace de tu tarjeta para consultar tu progreso actualizado.'}]}};
}
