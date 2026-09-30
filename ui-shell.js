/* Presentation only. Existing handlers and server-side permissions remain authoritative. */
(()=>{
 const byId=id=>document.getElementById(id),app=byId('app');
 const customerSection=byId('customers').closest('section');
 const rewardSection=byId('rewards').closest('section');
 customerSection.id='customerSection';rewardSection.id='rewardSection';
 const panels={clients:customerSection,rewards:rewardSection,staff:byId('staffSection'),admin:byId('superAdminSection')};
 const quick=document.createElement('div');quick.className='quickCards';
 quick.innerHTML='<section class="card" id="quickPromotion"><h2>Promociones</h2><p>Comparte novedades y beneficios con tus clientes.</p><button type="button" id="quickCampaign">Crear promoción</button></section><section class="card"><h2>Accesos rápidos</h2><p>Registra una visita desde la ficha de tu cliente.</p><button type="button" id="quickVisit" class="secondary">Buscar cliente</button> <button type="button" id="quickHistory" class="secondary" hidden>Ver historial</button></section>';
 byId('businessWorkspace').appendChild(quick);
 let view='home',lastBusiness=null,scheduled=false;
 const available=id=>{const el=byId(id);return el&&!el.hidden&&!el.disabled};
 function openExperience(campaign){
  if(!available('openCustomerExperience'))return;
  byId('openCustomerExperience').click();
  const form=byId(campaign?'experienceCampaign':'experienceDesign');
  if(form){form.closest('details').open=true;if(campaign)byId('experienceDesign').closest('details').open=false;form.closest('details').scrollIntoView({block:'nearest'});}
 }
 function allowed(key){
  const biz=!!businessId&&!byId('businessWorkspace').hidden;
  if(['home','admin'].includes(key))return key==='home'||!byId('superAdminSection').hidden;
  if(!biz)return false;
  if(key==='staff')return !byId('staffSection').hidden;
  if(key==='promotions'||key==='branding')return available('openCustomerExperience');
  return true;
 }
 function navigate(key){
  if(!allowed(key))return;
  if(key==='promotions'||key==='branding'){openExperience(key==='promotions');return;}
  view=key;paint();
  if(panels[key]){
   const toggle=panels[key].querySelector('.sectionToggle');
   if(toggle?.getAttribute('aria-expanded')==='false'&&!toggle.disabled)toggle.click();
  }
 }
 function paint(){
  if(!allowed(view))view='home';
  for(const [key,panel] of Object.entries(panels))panel.classList.toggle('workspaceOff',view==='home'?!['clients'].includes(key):view!==key);
  document.querySelector('.stats').classList.toggle('workspaceOff',view!=='home');
  quick.classList.toggle('workspaceOff',view!=='home');
  document.querySelector('.workspaceTools').classList.toggle('workspaceOff',!['home','clients'].includes(view));
  byId('viewSubtitle').textContent=({home:'Tu negocio, de un vistazo.',clients:'Tus clientes, siempre cerca.',rewards:'Beneficios que hacen que vuelvan.',staff:'El equipo detrás de tu negocio.',admin:'Todos tus negocios, en un solo lugar.'})[view];
  for(const b of document.querySelectorAll('[data-view]')){b.hidden=!allowed(b.dataset.view);if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
 }
 function filter(){
  const query=byId('customerSearchInput').value.trim().toLocaleLowerCase('es');let shown=0,total=0;
  for(const item of byId('customers').children){if(!item.classList.contains('item'))continue;total++;const match=(item.dataset.customerName||'').includes(query);item.hidden=!match;if(match)shown++;}
  byId('customerSearchEmpty').hidden=!(query&&total&&shown===0);
 }
 function enhanceCustomers(){
  for(const item of byId('customers').children){
   if(!item.classList.contains('item')||item.querySelector('.customerDetails'))continue;
   const row=item.querySelector(':scope > .row');if(!row)continue;
   const name=row.querySelector('b')?.textContent.trim()||'Cliente';item.dataset.customerName=name.toLocaleLowerCase('es');
   const details=document.createElement('details');details.className='customerDetails';
   const summary=document.createElement('summary'),avatar=document.createElement('span');avatar.className='customerAvatar';avatar.setAttribute('aria-hidden','true');avatar.textContent=name.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
   summary.append(avatar,row);
   const badge=row.querySelector('.badge');const [a,b]=(badge?.textContent.trim()||'').split('/').map(Number);
   if(b>0&&Number.isFinite(a)){const bar=document.createElement('span');bar.className='customerBar';bar.setAttribute('aria-hidden','true');const fill=document.createElement('i');fill.style.width=Math.min(100,Math.max(0,a/b*100))+'%';bar.appendChild(fill);row.insertBefore(bar,badge);}
   const content=document.createElement('div');content.className='customerDetailBody';while(item.firstChild)content.appendChild(item.firstChild);
   details.append(summary,content);item.appendChild(details);
  }
  filter();
 }
 function sync(){
  scheduled=false;
  const name=byId('biz').textContent;
  if(byId('sideBusinessName').textContent!==name)byId('sideBusinessName').textContent=name;
  const role=currentIsSuperAdmin?'Superadmin':currentBusinessRole==='owner'?'Owner':currentBusinessRole==='staff'?'Staff':'';
  if(byId('sideRole').textContent!==role)byId('sideRole').textContent=role;
  if(lastBusiness!==businessId){lastBusiness=businessId;view='home';byId('customerSearchInput').value='';}
  byId('quickNewClient').hidden=!available('newClient')||!businessId;
  byId('quickPromotion').hidden=!available('openCustomerExperience');
  byId('quickHistory').hidden=!available('openVisitHistory');
  enhanceCustomers();paint();
 }
 const selector=byId('businessSelector');document.querySelector('.businessSlot').insertBefore(selector,byId('sideRole'));
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
 byId('quickNewClient').onclick=()=>{if(available('newClient'))byId('newClient').click()};
 byId('quickCampaign').onclick=()=>openExperience(true);
 byId('quickVisit').onclick=()=>{navigate('clients');byId('customerSearchInput').focus()};
 byId('quickHistory').onclick=()=>{if(available('openVisitHistory'))byId('openVisitHistory').click()};
 byId('customerSearchInput').addEventListener('input',filter);
 // Observe source data/permission changes, not the navigation's own DOM updates.
 const observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(sync)}});
 for(const id of ['app','businessWorkspace','staffSection','superAdminSection','openCustomerExperience','openVisitHistory','newClient'])observer.observe(byId(id),{attributes:true,attributeFilter:['hidden','disabled']});
 observer.observe(byId('customers'),{childList:true});observer.observe(byId('biz'),{childList:true,characterData:true,subtree:true});
 sync();
})();
