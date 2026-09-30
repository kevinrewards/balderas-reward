// Checkpoints are scoped to the signed-in administrator and business slug.
// A confirmed business is reused after a later step fails; no customer/visit data is removed.
window.BusinessSetup = (() => {
 const memory=new Map();let running=false;
 const prefix='balderas-business-setup:';
 function read(key){try{return memory.get(key)||JSON.parse(sessionStorage.getItem(key)||'null')}catch{return memory.get(key)||null}}
 function save(key,state){memory.set(key,state);try{sessionStorage.setItem(key,JSON.stringify(state))}catch{}}
 function clear(key){memory.delete(key);try{sessionStorage.removeItem(key)}catch{}}
 async function run(client,input,assignOwner,progress=()=>{}){
  if(running)throw new Error('La creación del negocio ya está en curso.');
  const name=input.name.trim(),slug=input.slug.trim().toLowerCase(),ownerName=input.ownerName.trim(),ownerEmail=input.ownerEmail.trim().toLowerCase();
  if(!name||!slug||!ownerName||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail))throw new Error('Completa el negocio, el nombre del Owner y un correo válido.');
  if(!Number.isInteger(input.branding.progress_goal)||input.branding.progress_goal<1||input.branding.progress_goal>100)throw new Error('La meta debe ser un número entero de 1 a 100.');
  running=true;let state=null,key=null,stage='permisos';
  try{
   const identity=await client.auth.getUser();if(identity.error||!identity.data?.user)throw new Error('Sesión no válida. Inicia sesión nuevamente.');
   const permission=await client.rpc('is_platform_admin');if(permission.error||permission.data!==true)throw new Error('Solo Superadmin puede crear negocios.');
   key=prefix+identity.data.user.id+':'+slug;state=read(key);
   if(state&&state.name!==name)throw new Error('Hay un alta pendiente con este identificador y otro nombre. Usa el nombre original para continuar.');
   stage='negocio';progress('Creando negocio…');
   if(!state){
    const result=await client.rpc('admin_create_business',{new_name:name,new_slug:slug});if(result.error)throw result.error;
    if(!result.data)throw new Error('No se confirmó la creación del negocio. Revisa la lista antes de reintentar.');
    state={id:result.data,name,logoPath:null,brandingSaved:false};save(key,state);
   }
   if(!state.brandingSaved){
    if(input.logoFile){
     stage='logotipo';progress('Guardando el logotipo…');
     const extension=input.logoFile.name.split('.').pop().toLowerCase();
     if(!['png','jpg','jpeg','webp'].includes(extension))throw new Error('El logo debe ser PNG, JPG o WEBP.');
     const path=state.id+'/logo.'+extension;
     const uploaded=await client.storage.from('business-assets').upload(path,input.logoFile,{upsert:true});if(uploaded.error)throw uploaded.error;
     state.logoPath=path;save(key,state);
    }
    stage='diseño';progress('Guardando el diseño del negocio…');
    const branding=await client.from('business_branding').upsert({...input.branding,business_id:state.id,logo_path:state.logoPath},{onConflict:'business_id'});
    if(branding.error)throw branding.error;state.brandingSaved=true;save(key,state);
   }
   stage='Owner';progress('Asignando el Owner…');
   const ownerMessage=await assignOwner(client,state.id,ownerName,ownerEmail);
   clear(key);return {businessId:state.id,ownerMessage};
  }catch(error){
   const detail=error?.message||'No se pudo completar el alta.';
   if(state?.id){const e=new Error('El negocio «'+state.name+'» ya está creado. Falló el paso '+stage+': '+detail+' Puedes pulsar Continuar alta para reintentar con el mismo identificador.');e.businessId=state.id;throw e;}
   throw error;
  }finally{running=false;}
 }
 return {run};
})();
