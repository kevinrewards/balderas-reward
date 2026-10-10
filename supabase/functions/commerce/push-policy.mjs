export function validPushSubscription(value) {
  try {
    const url=new URL(value.endpoint);
    const host=url.hostname;
    const allowed=host==='fcm.googleapis.com' || host==='updates.push.services.mozilla.com' || host.endsWith('.push.apple.com');
    return allowed && url.protocol==='https:' && !url.username && !url.password && !url.port && value.endpoint.length<=2000
      && /^[A-Za-z0-9_-]{80,100}$/.test(value.keys?.p256dh || '') && /^[A-Za-z0-9_-]{20,30}$/.test(value.keys?.auth || '');
  } catch {return false;}
}

export function notificationPayload(row,base){
 const url=new URL('negocio.html',base);url.hash='seguimiento='+row.token;
 const statuses={confirmed:'El negocio confirmó tu solicitud.',in_progress:'Tu solicitud está en proceso.',completed:'Tu solicitud fue completada.',rejected:'El negocio no pudo aceptar tu solicitud.',cancelled:'Tu solicitud fue cancelada.',pending:'El negocio actualizó tu solicitud.'};
 let body=statuses[row.status]||'Hay cambios en tu solicitud.';
 if(row.confirmed_at&&['confirmed','in_progress'].includes(row.status)){
  body+=' Horario: '+new Intl.DateTimeFormat('es-MX',{timeZone:row.timezone,dateStyle:'short',timeStyle:'short',hourCycle:'h23'}).format(new Date(row.confirmed_at))+'.';
 }
 return {title:String(row.business_name||'Tu negocio').slice(0,80),body:body+' Toca para revisar los detalles.',url:url.href,tag:'commerce-'+row.subscription_id};
}
