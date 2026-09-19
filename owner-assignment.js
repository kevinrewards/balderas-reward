async function assignOwnerToBusiness(client, business, name, email) {
  const permission = await client.rpc('is_platform_admin');
  if (permission.error || permission.data !== true) throw new Error('Solo Superadmin puede asignar Owners.');
  const linked = await client.rpc('admin_assign_existing_owner', {
    target_business_id: business, owner_email: email.trim().toLowerCase()
  });
  if (linked.error) throw linked.error;
  if (linked.data?.found === true && linked.data?.success === true) return 'Cuenta existente vinculada como Owner activo. Conserva sus accesos a otros negocios.';
  if (linked.data?.found !== false) throw new Error('No se pudo verificar la cuenta del Owner.');
  // Reuse the same server-side invitation flow as the new-business wizard.
  const created = await client.functions.invoke('create-business-owner', { body: {
    business_id: business, owner_name: name.trim(), owner_email: email.trim().toLowerCase()
  }});
  if (created.error) {
    let detail;
    try { detail = await created.error.context?.json(); } catch {}
    throw new Error(detail?.error || detail?.message || created.error.message || 'No se pudo crear el Owner.');
  }
  if (created.data?.success !== true) throw new Error(created.data?.error || created.data?.message || 'No se confirmó el alta. Revisa la lista antes de reintentar.');
  return 'Owner creado y asignado al negocio seleccionado.';
}

window.ownerAssignment = (() => {
  const dialog = $('ownerAssignmentDialog');
  const message = $('ownerAssignmentMessage');
  let busy = false, revision = 0;
  function close() { if (busy) return; ++revision; dialog.close(); }
  async function open() {
    if (!currentIsSuperAdmin || busy) return;
    const ticket = ++revision;
    $('ownerAssignmentForm').reset();
    $('ownerAssignmentSubmit').disabled = true;
    $('ownerAssignmentBusiness').innerHTML = '';
    message.textContent = 'Cargando negocios…';
    dialog.showModal();
    try {
      const {data,error} = await db.rpc('admin_list_businesses');
      if (ticket !== revision || !dialog.open) return;
      if (error) throw error;
      const businesses = new Map((data || []).filter(b => b.business_active === true).map(b => [b.business_id,b]));
      const select = $('ownerAssignmentBusiness');
      select.innerHTML = '<option value="">Selecciona un negocio</option>' + [...businesses.values()]
        .sort((a,b) => a.business_name.localeCompare(b.business_name,'es'))
        .map(b => `<option value="${escapeHtml(b.business_id)}">${escapeHtml(b.business_name)}${b.business_slug ? ' · '+escapeHtml(b.business_slug) : ''}</option>`).join('');
      message.textContent = businesses.size ? '' : 'No hay negocios activos disponibles.';
      $('ownerAssignmentSubmit').disabled = !businesses.size;
    } catch (error) { if (ticket === revision) message.textContent = error.message || 'No se pudieron cargar los negocios.'; }
  }
  $('openOwnerAssignment').onclick = open;
  $('closeOwnerAssignment').onclick = close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  $('ownerAssignmentForm').onsubmit = async event => {
    event.preventDefault();
    if (busy || !currentIsSuperAdmin || !dialog.open) return;
    const business = $('ownerAssignmentBusiness').value;
    const name = $('ownerAssignmentName').value.trim();
    const email = $('ownerAssignmentEmail').value.trim();
    if (!business || !name || !email || !$('ownerAssignmentConsent').checked) return;
    busy=true;
    for (const el of $('ownerAssignmentForm').elements) el.disabled=true;
    $('closeOwnerAssignment').disabled=true;
    message.textContent='Guardando Owner…';
    try {
      const result = await assignOwnerToBusiness(db,business,name,email);
      message.textContent=result;
      await openOwnersAdmin({reveal:false});
      $('ownerAssignmentConsent').checked=false;
    } catch (error) { message.textContent=error.message || 'No se pudo guardar el Owner.'; }
    finally {
      busy=false;
      for (const el of $('ownerAssignmentForm').elements) el.disabled=false;
      $('closeOwnerAssignment').disabled=false;
    }
  };
  return {open,close};
})();
