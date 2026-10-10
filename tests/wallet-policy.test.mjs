import {test} from 'node:test';import assert from 'node:assert/strict';
import {validPushSubscription,walletPayload} from '../supabase/functions/loyalty-v2/policy.mjs';
test('Push endpoints cannot target arbitrary servers or local networks',()=>{
 const keys={p256dh:'a'.repeat(87),auth:'a'.repeat(22)};
 for(const endpoint of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.com/x','https://fcm.googleapis.com:8080/x','https://user@fcm.googleapis.com/x'])assert.equal(validPushSubscription({endpoint,keys}),false);
 for(const endpoint of ['https://fcm.googleapis.com/fcm/send/x','https://web.push.apple.com/x','https://updates.push.services.mozilla.com/wpush/x'])assert.equal(validPushSubscription({endpoint,keys}),true);
});
test('Wallet object stays scoped to customer and business with a live balance link',()=>{
 const r=walletPayload({issuer:'123',customer:{id:'c-1',name:'Cliente',qr_token:'token'},business:{id:'b-2',name:'Negocio'},design:{program_name:'Club'},base:'https://example.com/reward/'});
 assert.equal(r.classId,'123.business_b2');assert.equal(r.objectId,'123.customer_c1');
 assert.equal(r.passObject.barcode.value,'https://example.com/reward/checkin.html?token=token');
 assert.equal(r.passClass.programName,'Club');assert.equal(r.passObject.loyaltyPoints,undefined);
});

test('Wallet links use the business public code and only enabled modules',()=>{
 const args={issuer:'123',customer:{id:'customer-1',name:'Ana',qr_token:'private-customer-token'},business:{id:'business-1',name:'Negocio'},design:{},base:'https://balderas-reward.netlify.app/',portalCode:'business-public-code',modules:{catalog:true,agenda:false,catalog_label:'Menú'}};
 const data=walletPayload(args);const links=data.passObject.linksModuleData.uris;
 assert.equal(links.length,2);assert.equal(links[1].uri,'https://balderas-reward.netlify.app/negocio.html?negocio=business-public-code#catalogo');assert.equal(links[1].description,'Menú');assert(!links[1].uri.includes('private-customer-token'));
});
