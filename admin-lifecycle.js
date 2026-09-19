/* All writes are validated by the server. No privileged key is used here. */
window.adminLifecycle = (() => {
  let busy = false;
  const dialog = document.createElement("dialog");
  dialog.className = "card";
  dialog.innerHTML = '<form method="dialog"><h2 id="lifecycleTitle"></h2><div id="lifecycleScope"></div>' +
    '<p>Esta acción es irreversible. Escribe el nombre exacto del negocio para confirmar.</p>' +
    '<input id="lifecycleConfirmation" autocomplete="off" aria-label="Nombre del negocio" required>' +
    '<div class="staffActions"><button value="cancel" formnovalidate class="secondary">Cancelar</button>' +
    '<button value="confirm" class="dangerButton">Confirmar eliminación</button></div></form>';
  dialog.setAttribute("aria-labelledby", "lifecycleTitle");
  document.body.appendChild(dialog);
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "secondary";
  retry.textContent = "Reintentar bajas de cuentas pendientes";
  $("superAdminSection").appendChild(retry);

  async function invoke(body) {
    const { data, error } = await db.functions.invoke("admin-lifecycle", { body });
    if (error) {
      let detail;
      try { detail = await error.context?.json(); } catch {}
      throw new Error(detail?.error || "No se pudo completar la operación. Comprueba que admin-lifecycle esté instalada y actualiza las listas antes de reintentar.");
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }
  async function confirmScope(preview, action) {
    $("lifecycleTitle").textContent = action === "delete_business" ? "Eliminar " + preview.business_name : "Eliminar Owner de " + preview.business_name;
    const lines = action === "delete_business" ? [
      `Se eliminarán ${preview.customers} clientes, ${preview.rewards} recompensas, ${preview.visits} visitas, ${preview.redemptions} canjes y ${preview.members} vínculos de personal. También se eliminará la personalización.`
    ] : ["Se quitará el vínculo de Owner con este negocio. Los clientes y el historial del negocio se conservarán."];
    const removed = preview.owners.filter(o => !o.protected && !o.other_links && !o.customer_links).length;
    lines.push(`${removed} cuenta(s) de Owner sin otros vínculos se darán de baja definitivamente. Las demás cuentas se conservarán.`);
    lines.push("La baja de cuenta conserva una referencia para el historial; no se puede reactivar. Desactivar el vínculo sí permite reactivarlo después.");
    $("lifecycleScope").innerHTML = lines.map(line => "<p>" + escapeHtml(line) + "</p>").join("");
    const input = $("lifecycleConfirmation");
    input.value = "";
    input.setCustomValidity("");
    input.oninput = () => input.setCustomValidity(input.value === preview.business_name ? "" : "Escribe el nombre exacto del negocio.");
    input.setCustomValidity("Escribe el nombre exacto del negocio.");
    dialog.returnValue = "cancel";
    dialog.showModal();
    await new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
    return dialog.returnValue === "confirm" && input.value === preview.business_name;
  }
  async function run(action, business, userId = null) {
    if (busy || !currentIsSuperAdmin || !business?.businessId) return false;
    busy = true;
    try {
      const { data: preview, error } = await db.rpc("admin_lifecycle_preview", {
        target_business_id: business.businessId, target_user_id: userId,
      });
      if (error) throw error;
      const destructive = ["delete_business", "remove_owner"].includes(action);
      if (destructive ? !await confirmScope(preview, action) :
        !confirm(`${action === "deactivate" ? "Desactivar" : "Reactivar"} Owner en ${preview.business_name}? Solo cambia el acceso a este negocio.`)) return false;
      const result = await invoke({ action, business_id: business.businessId, user_id: userId,
        version: preview.version, confirmation: preview.business_name });
      const text = (action === "delete_business" ? "Negocio eliminado." : action === "remove_owner" ? "Vínculo de Owner eliminado." : "Acceso del Owner actualizado.") +
        (result.cleanup_pending ? " Hay bajas de cuentas pendientes: usa Reintentar bajas en BALDERAS Admin." : "");
      if (action === "delete_business") { businessControl.close(); $("businessManageModal").hidden = true; }
      if (action === "remove_owner") $("ownerManageModal").hidden = true;
      if (["deactivate", "reactivate"].includes(action) && selectedOwner?.businessId === business.businessId && selectedOwner?.userId === userId) {
        await refreshOwnerMembershipStatus();
      }
      await load();
      // load() refreshes the business dashboard, not the separate Owners list.
      // Refresh that list from the server without reopening a hidden modal.
      await openOwnersAdmin({ reveal: false });
      $("status").textContent = text;
      alert(text);
      return true;
    } catch (error) {
      alert(error.message || "No se pudo completar la operación.");
      return false;
    } finally { busy = false; }
  }
  $("deleteBusiness").onclick = () => run("delete_business", { ...selectedBusinessManage });
  for (const [id, action] of [["deactivateOwner", "deactivate"], ["reactivateOwner", "reactivate"], ["removeOwner", "remove_owner"]]) {
    $(id).onclick = () => selectedOwner && run(action, { ...selectedOwner }, selectedOwner.userId);
  }
  retry.onclick = async () => {
    if (busy || !currentIsSuperAdmin) return;
    busy = true; retry.disabled = true;
    try {
      const result = await invoke({ action: "retry" });
      alert(result.cleanup_pending ? "Aún hay bajas pendientes. Revisa los registros de admin-lifecycle en Supabase." : "Lote procesado. Si había más de 50 bajas pendientes, vuelve a pulsar para procesar las siguientes.");
    } catch (error) { alert(error.message); }
    finally { busy = false; retry.disabled = false; }
  };
  return { run };
})();
