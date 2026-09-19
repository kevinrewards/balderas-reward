const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const c=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../owner-assignment.js'),'utf8').split('window.ownerAssignment =')[0],c);
function fixture({admin=true,found=true,error=null,created=true}={}){
  const calls=[];
  return {calls,client:{rpc:async(name,args)=>{calls.push([name,args]);return name==='is_platform_admin'?{data:admin}:{data:{found,success:found},error};},functions:{invoke:async(name,args)=>{calls.push([name,args]);return {data:{success:created}};}}}};
}
test('Existing account is assigned to selected business without an invitation or new account',async()=>{
  const f=fixture();await c.assignOwnerToBusiness(f.client,'B','Name',' X@Example.com ');
  assert.equal(f.calls.length,2);assert.equal(f.calls[1][1].target_business_id,'B');assert.equal(f.calls[1][1].owner_email,'x@example.com');
});
test('New account reuses existing creation flow with the selected business',async()=>{
  const f=fixture({found:false});await c.assignOwnerToBusiness(f.client,'B','Name','x@example.com');
  assert.equal(f.calls[2][0],'create-business-owner');assert.equal(f.calls[2][1].body.business_id,'B');
});
test('Staff/Owner denial or failed lookup cannot fall through to account creation',async()=>{
  for(const options of [{admin:false},{error:{message:'Denied'}}]){
    const f=fixture(options);await assert.rejects(c.assignOwnerToBusiness(f.client,'B','Name','x@example.com'));
    assert.ok(!f.calls.some(x=>x[0]==='create-business-owner'));
  }
});
test('Unconfirmed creation is not reported as a successful assignment',async()=>{
  const f=fixture({found:false,created:false});await assert.rejects(c.assignOwnerToBusiness(f.client,'B','Name','x@example.com'));
});
