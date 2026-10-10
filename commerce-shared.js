/* Shared presentation helpers; database permissions remain authoritative. */
window.Commerce={
 modes:{delivery:'Entrega a domicilio',dine_in:'Consumo en el lugar',pickup:'Recoger en negocio',service:'Servicio / Cita',reservation:'Reservación'},
 states:{pending:'Pendiente de confirmación',confirmed:'Confirmada',in_progress:'En proceso',completed:'Completada',rejected:'Rechazada',cancelled:'Cancelada'},
 escape:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 money:v=>v===null||v===''?'Consultar precio':new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(v),
 date:(v,zone)=>v?new Intl.DateTimeFormat('es-MX',{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'Por acordar',
 local:(v,zone)=>{if(!v)return '';const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(v)).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;},
 requested:(r,zone)=>r.requested_at?window.Commerce.date(r.requested_at,zone):r.requested_date?r.requested_date.split('-').reverse().join('/')+' · Hora por acordar':'Por acordar',
 safeImage:v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href:''}catch{return ''}},
 url:(code,section)=>{const u=new URL('negocio.html',location.href);u.searchParams.set('negocio',code);if(section)u.hash=section;return u.href;},
 async request(body){const r=await fetch('https://aitupbowuekcfdqsksny.supabase.co/functions/v1/commerce',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok||data.error)throw new Error(data.error||'No se pudo completar la solicitud.');return data;}
};
