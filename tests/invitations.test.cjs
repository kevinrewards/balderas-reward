const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function fixture(role, options={}) {
  let handler;
  const calls=[];
  const members=[{business_id:'A',user_id:'actor',role:options.actorRole||'owner',active:true}];
  if(options.member) members.push({business_id:'A',user_id:'target',...options.member});
  const profiles=[{user_id:'actor',active:true},{user_id:'target',full_name:'Original',active:options.profileActive!==false}];
  const tables={profiles,business_members:members,platform_admins:options.admin?[{user_id:'actor'}]:[],businesses:[{id:'A',name:'LG',active:options.businessActive!==false}]};
  function from(table) {
    let action='select',payload,config,filters=[];
    const q={select(){return q},eq(k,v){filters.push([k,v]);return q},upsert(p,c){action='upsert';payload=p;config=c;return q},update(p){action='update';payload=p;return q},maybeSingle(){return execute(true)},then(ok,bad){return execute(false).then(ok,bad)}};
    async function execute(single) {
      if(options.permissionError&&table==='platform_admins')return {data:null,error:{message:'offline'}};
      const rows=tables[table];
      if(action==='upsert') {
        calls.push(['write',table,payload,config]);
        const keys=config.onConflict.split(',');
        const existing=rows.find(r=>keys.every(k=>r[k]===payload[k]));
        if(!existing)rows.push({...payload});
        else if(!config.ignoreDuplicates)Object.assign(existing,payload);
      }
      if(action==='update')for(const r of rows.filter(r=>filters.every(([k,v])=>r[k]===v)))Object.assign(r,payload);
      const data=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
      return {data:single?(data[0]||null):data,error:null};
    }
    return q;
  }
  const auth={getUser:async()=>({data:{user:options.badAuth?null:{id:'actor'}},error:null}),admin:{
    listUsers:async({page})=>{
      calls.push(['list',page]);
      return {data:{users:options.secondPage&&page===1?Array.from({length:1000},(_,i)=>({id:'u'+i,email:'u'+i+'@test.com'})):options.newUser?[]:[{id:'target',email:'target@test.com'}]},error:null};
    },
    inviteUserByEmail:async(email,args)=>{calls.push(['invite',email,args]);return {data:{user:{id:'target'}},error:null}},
  },resetPasswordForEmail:async(email,args)=>{
    calls.push(['recovery',email,args]);
    if(options.raceOwner)members.push({business_id:'A',user_id:'target',role:'owner',active:true});
    return {error:options.mailError?{message:'Mail limit'}:null};
  }};
  const source=fs.readFileSync(`${__dirname}/../supabase/functions/create-business-${role}/index.ts`,'utf8').replace(/^import .*;\n/,'');
  vm.runInNewContext(source,{createClient:()=>({auth,from}),Deno:{serve:fn=>handler=fn,env:{get:k=>({SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',PUBLIC_APP_URL:'https://balderas-reward.netlify.app/'}[k])}},URL,Response,console});
  return {calls,members,profiles,run:async()=>{
    const response=await handler(new Request('https://function.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({business_id:'A',[role+'_name']:'Nuevo',[role+'_email']:'target@test.com'})}));
    return {status:response.status,body:await response.json()};
  }};
}
test('Staff cannot create Staff, and Owner cannot create Owner',async()=>{
  for(const [role,actorRole] of [['staff','staff'],['owner','owner']]){
    const f=fixture(role,{actorRole});assert.equal((await f.run()).body.success,false);assert.equal(f.calls.length,0);
  }
});
test('Permission lookup error fails before Auth admin or mail calls',async()=>{
  const f=fixture('staff',{permissionError:true});assert.equal((await f.run()).body.success,false);assert.equal(f.calls.length,0);
});
test('Existing Owner cannot be overwritten by Staff or receive a recovery email from this operation',async()=>{
  const f=fixture('staff',{member:{role:'owner',active:true}});assert.equal((await f.run()).body.success,false);assert.equal(f.members[1].role,'owner');assert.ok(!f.calls.some(c=>c[0]==='recovery'||c[0]==='write'));
});
test('Inactive profile, membership and business remain inactive without sending mail',async()=>{
  for(const options of [{profileActive:false},{member:{role:'staff',active:false}},{businessActive:false}]){
    const f=fixture('staff',options);assert.equal((await f.run()).body.success,false);assert.ok(!f.calls.some(c=>['invite','recovery','write'].includes(c[0])));
  }
});
test('Second page user is found, original profile preserved, and Netlify used',async()=>{
  const f=fixture('staff',{secondPage:true});assert.equal((await f.run()).body.existing_user,true);assert.deepEqual(f.calls.filter(c=>c[0]==='list').map(c=>c[1]),[1,2]);assert.equal(f.profiles[1].full_name,'Original');assert.equal(f.calls.find(c=>c[0]==='recovery')[2].redirectTo,'https://balderas-reward.netlify.app/accept-invite.html');
});
test('New invitations for both roles use Netlify and assign scoped active membership',async()=>{
  for(const role of ['staff','owner']){
    const f=fixture(role,{newUser:true,admin:true});const result=await f.run();assert.equal(result.body.success,true);assert.equal(result.body.existing_user,false);assert.equal(f.members[1].role,role);assert.equal(f.members[1].business_id,'A');assert.equal(f.calls.find(c=>c[0]==='invite')[2].redirectTo,'https://balderas-reward.netlify.app/accept-invite.html');
  }
});
test('Owner added concurrently is not downgraded by the Staff assignment',async()=>{
  const f=fixture('staff',{raceOwner:true});assert.equal((await f.run()).body.success,false);assert.equal(f.members[1].role,'owner');
});
test('Only Superadmin can promote active Staff to Owner; profile name remains unchanged',async()=>{
  const f=fixture('owner',{admin:true,member:{role:'staff',active:true}});assert.equal((await f.run()).body.success,true);assert.equal(f.members[1].role,'owner');assert.equal(f.profiles[1].full_name,'Original');
});
test('Recovery failure does not assign membership or rewrite profile',async()=>{
  const f=fixture('staff',{mailError:true});assert.equal((await f.run()).body.success,false);assert.ok(!f.calls.some(c=>c[0]==='write'));
});
