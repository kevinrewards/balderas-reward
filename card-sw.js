/* No card tokens, balances or customer pages are cached. Online data stays authoritative. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const safe=new URL('card.html',self.registration.scope);
 try{const target=new URL(data.url);if(target.origin===safe.origin&&target.pathname===safe.pathname)safe.href=target.href;}catch{}
 event.waitUntil(self.registration.showNotification(String(data.title||'BALDERAS Reward'),{body:String(data.body||''),tag:String(data.tag||''),icon:new URL('icons/icon-192.png',self.registration.scope).href,data:{url:safe.href}}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(self.clients.openWindow(event.notification.data.url));});
