const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../visit-history.js'),'utf8');
const ctx=vm.createContext({Date});
vm.runInContext(source.split('window.visitHistory =')[0]+'\nthis.h=VisitHistoryData;',ctx);
const h=ctx.h;
test('Calendar periods handle month and year boundaries and Monday weeks',()=>{
  assert.equal(h.dates('week',new Date(2026,0,4)).start,'2025-12-29');
  assert.equal(h.dates('week',new Date(2026,0,4)).end,'2026-01-04');
  assert.equal(h.dates('month',new Date(2024,1,15)).end,'2024-02-29');
});
test('Custom range includes the entire final day and rejects impossible dates',()=>{
  const r=h.bounds('2026-09-01','2026-09-19');
  const end=new Date(r.period_end);
  assert.equal(end.getDate(),20); assert.equal(end.getHours(),0);
  assert.throws(()=>h.bounds('2026-02-30','2026-03-01'));
  assert.throws(()=>h.bounds('2026-09-20','2026-09-19'));
});
test('CSV protects formulas and preserves commas, quotes, and accents',()=>{
  const csv=h.csv([{id:'v',customer_name:'=HYPERLINK("x")',created_at:'2026-09-01T10:00:00Z',registered_by_name:'José, "Owner"'}],'Negocio','America/Mazatlan');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(csv.includes('"José, ""Owner"""'));
});
test('Export downloads every page using the same cutoff',async()=>{
  const first={total_visits:3,unique_customers:2,as_of:'cutoff',rows:[{id:'1'},{id:'2'}]};
  const rows=await h.exportRows(async(offset,cutoff)=>{
    assert.equal(offset,2);assert.equal(cutoff,'cutoff');return {...first,rows:[{id:'3'}]};
  },first);
  assert.equal(rows.length,3);
});
test('Changed totals, duplicate rows and canceled queries never export incomplete reports',async()=>{
  const first={total_visits:2,unique_customers:1,rows:[{id:'1'}]};
  await assert.rejects(h.exportRows(async()=>({...first,total_visits:1}),first));
  await assert.rejects(h.exportRows(async()=>({...first,rows:[{id:'1'}]}),first));
  await assert.rejects(h.exportRows(async()=>first,first,()=>false));
});

function ui(){
  const elements={};let calls=[];let resolve;
  const el=id=>elements[id] ||= {value:'today',textContent:'',innerHTML:'',open:false,
    addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}};
  const c=vm.createContext({Date,Intl,window:{},$:el,escapeHtml:s=>String(s),
    businessId:'A',currentBusinessRole:'staff',currentIsSuperAdmin:false,
    selectedBusinessManage:{businessId:'B',businessName:'Business B'},
    db:{rpc:async(name,args)=>{calls.push([name,args]);return new Promise(done=>{resolve=done;});}}});
  vm.runInContext(source,c);
  return {c,el,calls,finish:data=>resolve(data)};
}
test('Staff has no history button; server denial clears the report',async()=>{
  const f=ui();assert.equal(f.el('openVisitHistory').hidden,true);
  const p=f.c.window.visitHistory.open('B','B');
  f.finish({error:{message:'No autorizado'}});await p;
  assert.equal(f.el('historyMessage').textContent,'No autorizado');
  assert.equal(f.el('historyExport').disabled,true);
});
test('Superadmin history targets B, not dashboard A, and close ignores late results',async()=>{
  const f=ui();f.c.currentIsSuperAdmin=true;
  const p=f.c.window.visitHistory.open('B','Business B');
  assert.equal(f.calls[0][1].target_business_id,'B');
  f.c.window.visitHistory.close();
  f.finish({data:{total_visits:1,unique_customers:1,rows:[{customer_name:'Late'}]}});await p;
  assert.equal(f.el('historyRows').innerHTML,'');
});
