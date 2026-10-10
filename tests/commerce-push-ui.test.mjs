import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
const source=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('Customer explicitly opts in per request; disabling never unsubscribes other notifications',async()=>{
 const dom=new JSDOM('<section id="tracking"></section>',{url:'https://example.com/negocio.html#seguimiento=token',runScripts:'outside-only'}),w=dom.window;let asks=0,unsubscribeCalls=0,calls=[];
 try{
 w.matchMedia=()=>({matches:false});w.PushManager=function(){};w.Notification={requestPermission:async()=>{asks++;return 'granted'}};
 const subscription={endpoint:'https://fcm.googleapis.com/test',toJSON:()=>({endpoint:'https://fcm.googleapis.com/test',keys:{}}),unsubscribe:()=>{unsubscribeCalls++}};
 const reg={pushManager:{getSubscription:async()=>subscription,subscribe:async()=>subscription}};
 Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>reg,ready:Promise.resolve(reg)}});
 w.Commerce={request:async p=>{calls.push(p);return{push_ready:true,subscribed:false,vapid_public_key:'YQ'}}};
 w.eval(await source('commerce-push.js'));await w.CommercePush.mount({token:'token-a',closed:false});assert.equal(asks,0);
 assert(w.document.querySelector('link[rel="manifest"]').href.includes('token=token-a'));
 await w.document.getElementById('commercePushToggle').onclick();assert.equal(asks,1);assert.equal(calls.at(-1).consent,true);assert.equal(calls.at(-1).token,'token-a');
 await w.document.getElementById('commercePushToggle').onclick();assert.equal(calls.at(-1).action,'unsubscribe');assert.equal(unsubscribeCalls,0);
 await w.CommercePush.mount({token:'token-b',closed:true});assert.equal(w.document.getElementById('commercePushToggle').disabled,true);assert.equal(asks,1);
 }finally{w.close()}
});
test('Shared worker routes both cards and tracking, rejecting unrelated origins and pages',async()=>{
 const handlers={},notifications=[];const context={self:{registration:{scope:'https://example.com/',showNotification:async(title,options)=>{notifications.push(options)}},addEventListener:(name,fn)=>{handlers[name]=fn}},URL,URLSearchParams};
 vm.runInNewContext(await source('card-sw.js'),context);
 for(const url of ['https://example.com/card.html?token=card','https://example.com/negocio.html#seguimiento=00000000-0000-0000-0000-000000000001','https://evil.com/negocio.html#seguimiento=00000000-0000-0000-0000-000000000001','https://example.com/index.html']){
  let waiting;handlers.push({data:{json:()=>({url,title:'Test'})},waitUntil:p=>{waiting=p}});await waiting;
 }
 assert(notifications[0].data.url.includes('?token=card'));assert(notifications[1].data.url.includes('#seguimiento='));assert.equal(notifications[2].data.url,'https://example.com/card.html');assert.equal(notifications[3].data.url,'https://example.com/card.html');
});
