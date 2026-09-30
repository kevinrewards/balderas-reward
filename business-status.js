/* Superadmin business activation lifecycle. Data is preserved on deactivation. */
window.businessStatusControl = (() => {
  const button = $("toggleBusinessActive");
  let busy = false;
  let revision = 0;

  async function requireAdmin() {
    const { data, error } = await db.rpc("is_platform_admin");
    if (error || data !== true) throw new Error("Solo Superadmin puede cambiar el estado de un negocio.");
  }

  async function readSelectedStatus() {
    const selected = selectedBusinessManage;
    if (!selected?.businessId) throw new Error("Selecciona un negocio.");
    const ticket = ++revision;
    const { data, error } = await db.rpc("admin_list_businesses");
    if (error) throw error;
    if (ticket !== revision || selectedBusinessManage?.businessId !== selected.businessId) return null;
    const row = (data || []).find(item => item.business_id === selected.businessId);
    if (!row) throw new Error("El negocio ya no está disponible.");
    return { selected, active: row.business_active === true };
  }

  function paint(active) {
    button.hidden = false;
    button.className = active ? "secondary" : "";
    button.textContent = active ? "⏸ Desactivar negocio" : "▶ Reactivar negocio";
    button.dataset.businessActive = String(active);
  }

  async function refresh() {
    if (!button || !currentIsSuperAdmin || !selectedBusinessManage || $("businessManageModal").hidden) return;
    button.disabled = true;
    try {
      const state = await readSelectedStatus();
      if (!state) return;
      state.selected.businessActive = state.active;
      paint(state.active);
    } catch (error) {
      button.hidden = true;
      $("businessManageMessage").textContent = error.message || "No se pudo consultar el estado del negocio.";
    } finally {
      button.disabled = false;
    }
  }

  async function toggle() {
    if (busy || !currentIsSuperAdmin || !selectedBusinessManage?.businessId) return;
    busy = true;
    button.disabled = true;
    const message = $("businessManageMessage");
    try {
      await requireAdmin();
      const state = await readSelectedStatus();
      if (!state) return;
      const next = !state.active;
      const verb = next ? "reactivar" : "desactivar";
      const detail = next
        ? "El negocio volverá a quedar activo. No se restauran datos porque nunca se eliminaron."
        : "Se conservarán clientes, visitas, recompensas, canjes, Owners, Staff e historial.";
      if (!confirm(`¿Quieres ${verb} ${state.selected.businessName}?\n\n${detail}`)) return;

      message.textContent = next ? "Reactivando negocio…" : "Desactivando negocio…";
      const { data, error } = await db.rpc("admin_set_business_active", {
        target_business_id: state.selected.businessId,
        requested_active: next
      });
      if (error) throw error;
      const active = data === true;
      state.selected.businessActive = active;
      paint(active);
      message.textContent = active
        ? "✓ Negocio reactivado. Todos sus datos se conservaron."
        : "✓ Negocio desactivado. Todos sus datos se conservaron.";
      await openBusinessAdmin();
      $("businessAdminModal").hidden = true;
      $("businessManageModal").hidden = false;
    } catch (error) {
      message.textContent = error.message || "No se pudo cambiar el estado del negocio.";
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  if (button) button.onclick = toggle;

  // app.js selects the business first; this listener runs afterwards and reads
  // the authoritative state from the server.
  document.addEventListener("click", event => {
    if (event.target.closest(".businessManageButton")) queueMicrotask(refresh);
  });

  return { refresh };
})();
