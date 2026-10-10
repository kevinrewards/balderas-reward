/* Wallet is a display mirror: never retry a visit/redemption when synchronization fails. */
window.WalletSync={
  async refresh(db,{token,customerId}={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      if(!token){
        const result=await db.from('customers').select('qr_token').eq('id',customerId).single();
        if(result.error||!result.data?.qr_token)throw new Error('No se pudo consultar la tarjeta.');
        token=result.data.qr_token;
      }
      const response=await fetch('https://aitupbowuekcfdqsksny.supabase.co/functions/v1/loyalty-v2',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'refresh_wallet',token})});
      const result=await response.json();
      if(!response.ok||result.error)throw new Error('Wallet pendiente de actualizar.');
      return result;
    }catch{return {pending:true};}finally{clearTimeout(timer);}
  },
  async afterChange(db,params){
    const result=await this.refresh(db,params);
    if(result.pending)alert('La operación quedó registrada. El pase de Google Wallet está pendiente de actualizar; el cliente puede hacerlo desde su tarjeta web. No repitas la visita o el canje.');
    return result;
  }
};
