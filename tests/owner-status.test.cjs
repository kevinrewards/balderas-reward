const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function setup(){
  const elements={};
  const state={active:false,fail:false};
  const calls=[];
  const el=id=>elements[id] ||= {hidden:false,innerHTML:'',textContent:''};
  const ctx=vm.createContext({Map,Set,console,$:el,escapeHtml:x=>String(x??''),db:{rpc:async(name,args)=>{
    calls.push([name,args]);
    if(name==='admin_list_owners')return {data:[
      {business_id:'A',user_id:'same',business_name:'A',owner_name:'Owner A',membership_active:true},
      {business_id:'B',user_id:'same',business_name:'B',owner_name:'Owner B',membership_active:true}]};
    if(state.fail)return {error:{message:'Consulta rechazada'}};
    return {data:[{user_id:'same',role:args.target_business_id==='B'?'staff':'owner',active:state.active}]};
  }}});
  const list=source.slice(source.indexOf('let ownersListRevision'),source.indexOf('// BOTÓN OWNERS'));
  const start=source.indexOf('let selectedOwner = null');
  const detail=source.slice(start,source.indexOf('document.addEventListener(',start));
  vm.runInContext(list+detail+'\nthis.select = (id) => { selectedOwner={businessId:id,userId:"same"}; };',ctx);
  return {ctx,el,state,calls};
}
test('Owner list uses actual business membership even when general list reports active',async()=>{
  const f=setup();await f.ctx.openOwnersAdmin();
  const html=f.el('ownersAdminList').innerHTML;
  assert.match(html,/Acceso del Owner a este negocio: ● DESACTIVADO/);
  assert.doesNotMatch(html,/● ACTIVO/);
  assert.match(html,/SIN VERIFICAR/); // Staff membership must not become Owner access.
  const heading=html.slice(html.indexOf('businessAdminTop'),html.indexOf('ownerAdminPerson'));
  assert.doesNotMatch(heading,/ACTIVO|DESACTIVADO/);
});
test('Closing/reopening reads persisted status and reactivation refreshes from server',async()=>{
  const f=setup();f.ctx.select('A');await f.ctx.refreshOwnerMembershipStatus();
  assert.match(f.el('ownerManageStatus').textContent,/DESACTIVADO/);
  assert.equal(f.el('reactivateOwner').hidden,false);
  f.ctx.select('A');await f.ctx.refreshOwnerMembershipStatus();
  assert.match(f.el('ownerManageStatus').textContent,/DESACTIVADO/);
  f.state.active=true;await f.ctx.refreshOwnerMembershipStatus();
  assert.match(f.el('ownerManageStatus').textContent,/● ACTIVO/);
  assert.equal(f.el('reactivateOwner').hidden,true);
  assert.equal(f.calls.length,3);
});
test('A failed membership lookup shows unknown access, never a guessed active status',async()=>{
  const f=setup();f.ctx.select('A');f.state.fail=true;
  await f.ctx.refreshOwnerMembershipStatus();
  assert.equal(f.el('ownerManageStatus').textContent,'Acceso sin verificar');
  assert.equal(f.el('deactivateOwner').hidden,true);
  assert.equal(f.el('reactivateOwner').hidden,true);
});
