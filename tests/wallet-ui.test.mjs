import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
const source=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('Owner preview uses real branding, escapes program names and saves scoped settings',async()=>{
 const dom=new JSDOM(await source('index.html'),{url:'https://example.com',runScripts:'outside-only'}),w=dom.window,calls=[];
 try{
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.$=id=>w.document.getElementById(id);w.businessId='business-a';w.currentIsSuperAdmin=true;w.currentBusinessRole='owner';w.escapeHtml=s=>s;
 w.db={rpc:async(name,args)=>{calls.push({name,args});return {data:true}},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:'https://example.com/logo.png'}})})},from:table=>{const chain={select(){return chain},eq(){return chain},in(){return chain},gt(){return chain},order(){return chain},limit:async()=>({data:[]}),maybeSingle:async()=>({data:table==='business_branding'?{logo_path:'business-a/logo.png',progress_emoji:'🍱',empty_emoji:'○'}:{program_name:'<img src=x onerror=alert(1)>',background_color:'#111112',primary_color:'#e1b85d'}})};return chain}};
 w.eval(await source('customer-experience.js'));await w.customerExperience.open('business-a','Example');
 assert.equal(w.$('walletPreviewName').textContent,'<img src=x onerror=alert(1)>');assert.equal(w.$('walletPreviewName').children.length,0);
 assert.equal(new URL(w.$('walletPreviewArt').src).searchParams.get('icon'),'🍱');assert.equal(w.$('walletPreviewLogo').src,'https://example.com/logo.png');
 assert.equal(new URL(w.$('walletPreviewArt').src).searchParams.get('empty'),'○');
 assert.equal(new URL(w.$('walletPreviewArt').src).searchParams.get('v'),'2');
 w.$('experienceDesign').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await new Promise(r=>setTimeout(r,0));
 assert.equal(calls.find(c=>c.name==='save_card_presentation').args.target_business_id,'business-a');
 }finally{w.close()}
});
test('Wallet synchronization skips absent passes and reports failure without retrying business operations',async()=>{
 let calls=0,alerts=[];const context={window:{},AbortController,setTimeout,clearTimeout,alert:x=>alerts.push(x),fetch:async()=>{calls++;return Response.json({skipped:true})}};
 vm.runInNewContext(await source('wallet-sync.js'),context);
 assert.equal((await context.window.WalletSync.afterChange({}, {token:'private-token'})).skipped,true);assert.equal(alerts.length,0);
 context.fetch=async()=>{calls++;throw new Error('offline')};
 assert.equal((await context.window.WalletSync.afterChange({}, {token:'private-token'})).pending,true);assert.equal(calls,2);assert.equal(alerts.length,1);assert(alerts[0].includes('No repitas'));
});
