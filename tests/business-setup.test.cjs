const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture({uploadFails=false,brandingFails=false,ownerFails=false}={}){
 const calls=[],storage=new Map();let actor='admin',busy=false;
 const context={window:{},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../new-business-workflow.js','utf8'),context);
 const client={auth:{getUser:async()=>({data:{user:{id:actor}}})},rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='is_platform_admin'?true:'business-'+actor}},storage:{from(){return {upload:async(path)=>{calls.push(['upload',path]);return {error:uploadFails?{message:'new row violates row-level security policy'}:null}}}}},from(){return {upsert:async(payload)=>{calls.push(['branding',payload]);return {error:brandingFails?{message:'RLS'}:null}}}}};
 const assign=async(client,id,name,email)=>{calls.push(['owner',id,name,email]);if(ownerFails)throw new Error('Mail limit');return 'Owner listo'};
 const input={name:'Negocio A',slug:'negocio-a',ownerName:'Ana',ownerEmail:'ana@example.com',logoFile:{name:'logo.png'},branding:{progress_goal:10}};
 return {calls,input,storage,client,assign,run:()=>context.window.BusinessSetup.run(client,input,assign),fix(){uploadFails=false;brandingFails=false;ownerFails=false},actor(id){actor=id},restore(){vm.runInNewContext(fs.readFileSync(__dirname+'/../new-business-workflow.js','utf8'),context)}};
}
test('Logo RLS failure does not send mail; retry continues the same business',async()=>{
 const f=fixture({uploadFails:true});await assert.rejects(f.run(),e=>e.businessId==='business-admin'&&/logotipo/.test(e.message));assert(!f.calls.some(c=>c[0]==='owner'));f.fix();await f.run();assert.equal(f.calls.filter(c=>c[0]==='admin_create_business').length,1);assert.equal(f.calls.find(c=>c[0]==='owner')[1],'business-admin');
});
test('Branding failure retries with saved logo path after page reload',async()=>{
 const f=fixture({brandingFails:true});await assert.rejects(f.run(),/diseño/);f.fix();f.restore();f.input.logoFile=null;await f.run();assert.equal(f.calls.filter(c=>c[0]==='admin_create_business').length,1);assert.equal(f.calls.filter(c=>c[0]==='branding').at(-1)[1].logo_path,'business-admin/logo.png');
});
test('Owner/mail failure does not repeat business or branding writes',async()=>{
 const f=fixture({ownerFails:true});await assert.rejects(f.run(),/Mail limit/);f.fix();await f.run();assert.equal(f.calls.filter(c=>c[0]==='admin_create_business').length,1);assert.equal(f.calls.filter(c=>c[0]==='branding').length,1);assert.equal(f.storage.size,0);
});
test('Invalid owner is rejected before any business is written',async()=>{const f=fixture();f.input.ownerEmail='bad';await assert.rejects(f.run(),/correo/);assert.equal(f.calls.length,0)});
test('A different administrator cannot reuse another administrator checkpoint',async()=>{
 const f=fixture({ownerFails:true});await assert.rejects(f.run());f.fix();f.actor('other');await f.run();assert.equal(f.calls.filter(c=>c[0]==='admin_create_business').length,2);assert.equal(f.calls.filter(c=>c[0]==='owner').at(-1)[1],'business-other');
});
