import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
const source=async p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
const modules={business_id:'business-a',loyalty:false,catalog:true,agenda:true,loyalty_label:'Lealtad',catalog_label:'Servicios',agenda_label:'Pedidos',modes:['service'],timezone:'America/Mazatlan',opens:'09:00',closes:'20:00',reservation_capacity:20,service_capacity:1,default_minutes:60};
const item={id:'item-a',name:'<img src=x onerror=alert(1)>',description:'Texto',category:'Servicios',kind:'service',price:100,duration_minutes:30,available:true,visible:true,featured:false,sort_order:0,image_url:''};
test('Dashboard loads actual HTML, inserts modules in creation form, escapes names and sends tenant-scoped saves',async()=>{
 const dom=new JSDOM(await source('index.html'),{url:'https://example.com/',runScripts:'outside-only'});const w=dom.window,calls=[];
 try{
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.confirm=()=>true;w.mock={rpc:async(name,p)=>{calls.push({name,p});if(name==='list_business_members')return {data:[]};if(p.action==='get')return {data:{modules,manager:true,edit_catalog:true,manage_requests:true,code:'public-code',items:[item],staff:[],requests:[]}};return {data:{ok:true}}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:modules})})})})};
 w.db=w.mock;w.businessId='business-a';w.currentIsSuperAdmin=true;w.selectedBusinessManage={businessId:'business-a'};
 w.document.getElementById('app').hidden=false;w.document.getElementById('businessWorkspace').hidden=false;
 w.eval(await source('commerce-shared.js'));w.eval(await source('commerce-dashboard.js'));await tick();
 assert.equal(w.document.getElementById('newModuleloyalty').form.id,'newBusinessForm');
 assert.equal(w.businessModules.enabled('loyalty'),false);assert.equal(w.document.getElementById('commerceNavcatalog').hidden,false);
 await w.businessModules.open('business-a','catalog');
 assert.ok(w.document.querySelector('.commerceItem h3').textContent.includes('<img'));assert.equal(w.document.querySelectorAll('.commerceItem img').length,0);
 const form=w.document.querySelector('form[data-action="save_item"]');form.elements.name.value='Nuevo servicio';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();
 const save=calls.find(x=>x.p?.action==='save_item');assert.equal(save.p.bid,'business-a');assert.equal(save.p.payload.name,'Nuevo servicio');assert.equal(save.p.payload.visible,true);
 await w.businessModules.open('business-a','modules');const mod=w.document.querySelector('form[data-action="modules"]');mod.elements.catalog.checked=false;mod.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(calls.find(x=>x.p?.action==='modules').p.payload.catalog,false);
 w.document.getElementById('businessSelector').dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelector('.commerceDialog').open,false);
 }finally{dom.window.close()}
});
test('Public order has optional time, delivery address, selected quantities, and a private tracking link after submit',async()=>{
 const dom=new JSDOM(await source('negocio.html'),{url:'https://example.com/negocio.html?negocio=code',runScripts:'outside-only'}),w=dom.window,calls=[];
 try{
 w.supabase={createClient:()=>({rpc:async()=>({data:{name:'Negocio',modules:{...modules,modes:['delivery','reservation']},items:[item]}})})};
 const r={id:'12345678-order',name:'Ana',contact:'ana@example.com',status:'pending',mode:'delivery',items:[{...item,quantity:2}],requested_at:null,confirmed_at:null,comments:'',address:'Calle Uno 123',customer_response:'none',revision:1};
 w.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return {ok:true,json:async()=>body.action==='submit'?{token:'private-token',id:r.id}:{business_name:'Negocio',timezone:modules.timezone,request:r,events:[]}}};
 w.eval(await source('commerce-shared.js'));w.eval(await source('commerce-public.js'));await tick();
 const form=w.document.getElementById('requestForm');assert.equal(form.elements.requested_time.required,false);assert.equal(form.elements.address.required,true);
 form.elements.name.value='Ana';form.elements.contact.value='ana@example.com';form.elements.address.value='Calle Uno 123';w.document.querySelector('[data-quantity]').value='2';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();
 const body=calls.find(x=>x.action==='submit');assert.equal(body.payload.requested_at,'');assert.equal(body.payload.items[0].quantity,2);assert.equal(body.payload.address,'Calle Uno 123');assert.equal(w.location.hash,'#seguimiento=private-token');assert.equal(w.document.getElementById('tracking').hidden,false);
 assert.ok(w.document.getElementById('tracking').textContent.includes('Pendiente de confirmación'));
 }finally{dom.window.close()}
});
