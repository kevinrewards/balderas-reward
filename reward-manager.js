/* RLS is authoritative. These checks also prevent accidental out-of-scope UI writes. */
async function requireRewardPermission(id) {
  const { data, error } = await db.rpc("can_manage_business_settings", { target_business_id: id });
  if (error) throw error;
  if (data !== true) throw new Error("Solo el Superadmin o un Owner activo de este negocio puede administrar recompensas.");
}

function rewardPayload(input) {
  const name = String(input.name || "").trim();
  const description = String(input.description || "").trim();
  const required_visits = Number(input.required_visits);
  // Current cards render one star per visit, so cap this form at 100.
  if (!name || name.length > 200 || description.length > 2000 ||
      !Number.isInteger(required_visits) || required_visits < 1 || required_visits > 100) {
    throw new Error("Escribe un nombre (máximo 200 caracteres), una descripción de hasta 2000 y entre 1 y 100 visitas enteras.");
  }
  return { name, description: description || null, required_visits, active: input.active === true };
}

async function persistReward(id, rewardId, input, stillCurrent = () => true) {
  const payload = rewardPayload(input);
  await requireRewardPermission(id);
  if (!stillCurrent()) throw new Error("La sesión o el negocio seleccionado cambió. Abre nuevamente las recompensas.");
  const query = rewardId
    ? db.from("rewards").update(payload).eq("id", rewardId).eq("business_id", id)
    : db.from("rewards").insert({ ...payload, business_id: id });
  const { data, error } = await query.select("id").single();
  if (error) throw error;
  if (!data?.id) throw new Error("No se confirmó el cambio. Comprueba tus permisos y recarga la lista.");
  return data;
}

async function changeRewardState(id, rewardId, active, stillCurrent) {
  await requireRewardPermission(id);
  if (!stillCurrent()) throw new Error("El negocio seleccionado cambió.");
  const { data, error } = await db.from("rewards").update({ active })
    .eq("id", rewardId).eq("business_id", id).select("id").single();
  if (error) throw error;
  if (!data?.id) throw new Error("No se confirmó el cambio.");
}

async function removeReward(id, rewardId, stillCurrent) {
  await requireRewardPermission(id);
  if (!stillCurrent()) throw new Error("El negocio seleccionado cambió.");
  const { data, error } = await db.rpc("delete_business_reward", {
    target_business_id: id, target_reward_id: rewardId
  });
  if (error) throw error;
  if (data !== rewardId) throw new Error("No se confirmó la eliminación.");
}

async function persistProgressDesign(id, input, stillCurrent) {
  const payload = {
    progress_emoji: String(input.progress_emoji || "").trim(),
    empty_emoji: String(input.empty_emoji || "").trim()
  };
  if (Object.values(payload).some(value => !value || value.length > 16)) {
    throw new Error("Escribe un símbolo breve en ambos campos (máximo 16 caracteres).");
  }
  await requireRewardPermission(id);
  if (!stillCurrent()) throw new Error("El negocio seleccionado cambió.");
  const existing = await db.from("business_branding").select("business_id")
    .eq("business_id", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!stillCurrent()) throw new Error("El negocio seleccionado cambió.");
  const query = existing.data
    ? db.from("business_branding").update(payload).eq("business_id", id)
    : db.from("business_branding").insert({
      business_id: id, program_name: "Tarjeta de Lealtad", logo_path: null,
      primary_color: "#E1B85D", background_color: "#0D0D0E", progress_goal: 10,
      welcome_text: "Gracias por tu preferencia", ...payload
    });
  const { data, error } = await query.select("business_id").single();
  if (error) throw error;
  if (data?.business_id !== id) throw new Error("No se confirmó el diseño.");
}

window.rewardManager = (() => {
  const dialog = $("rewardManagerDialog");
  const form = $("rewardEditorForm");
  const list = $("rewardManagerList");
  const message = $("rewardManagerMessage");
  const designForm = $("progressDesignForm");
  let revision = 0;
  let permissionRevision = 0;
  let selectedId = null;
  let selectedReward = null;
  let rows = [];
  let saving = false;
  let changed = false;
  let onChange = null;

  const current = (ticket, id) => ticket === revision && selectedId === id && dialog.open;
  function setBusy(value) {
    saving = value;
    for (const control of dialog.querySelectorAll("button, input, textarea")) control.disabled = value;
  }
  function close() {
    ++revision;
    ++permissionRevision;
    if (dialog.open) dialog.close();
    form.hidden = true;
    designForm.hidden = true;
    rows = [];
    selectedId = null;
    $("editBusinessRewards").hidden = true;
  }
  async function syncPermission() {
    const ticket = ++permissionRevision;
    const id = businessId;
    $("editBusinessRewards").hidden = true;
    if (!id || $("app").hidden) return;
    try {
      await requireRewardPermission(id);
      if (ticket === permissionRevision && id === businessId && !$("app").hidden) {
        $("editBusinessRewards").hidden = false;
      }
    } catch { /* Fail closed. Reads and redemptions remain available. */ }
  }
  async function refresh() {
    const ticket = ++revision;
    const id = selectedId;
    rows = [];
    form.hidden = true;
    designForm.hidden = true;
    $("newManagedReward").hidden = true;
    $("retryRewardManager").hidden = true;
    list.innerHTML = "";
    message.textContent = "Cargando recompensas…";
    try {
      await requireRewardPermission(id);
      if (!current(ticket, id)) return;
      const { data, error } = await db.from("rewards")
        .select("id,name,description,required_visits,active")
        .eq("business_id", id).order("required_visits");
      if (!current(ticket, id)) return;
      if (error) throw error;
      rows = data || [];
      list.innerHTML = rows.map((reward, index) =>
        '<article class="businessAdminItem"><strong>' + escapeHtml(reward.name) +
        '</strong><p>' + escapeHtml(reward.required_visits) + ' visitas · ' +
        (reward.active ? "Activa" : "Inactiva") + '</p><p class="muted">' +
        escapeHtml(reward.description || "") + '</p><button class="secondary" type="button" data-edit-reward="' +
        index + '">Editar</button><div class="rewardRowActions">' +
        '<button type="button" class="secondary" data-reward-toggle="' + index + '">' +
        (reward.active ? "Desactivar" : "Reactivar") +
        '</button><button type="button" class="dangerButton" data-reward-delete="' + index +
        '">Eliminar</button></div></article>'
      ).join("") || '<p class="muted">No hay recompensas configuradas.</p>';
      $("newManagedReward").hidden = false;
      message.textContent = "";
      await loadDesign(ticket, id);
    } catch (error) {
      if (!current(ticket, id)) return;
      message.textContent = error.message || "No se pudieron cargar las recompensas.";
      $("retryRewardManager").hidden = false;
    }
  }
  function previewDesign() {
    $("progressDesignPreview").textContent = window.LoyaltyProgress.render(3, 5, {
      progress_emoji: $("progressFilledSymbol").value,
      empty_emoji: $("progressEmptySymbol").value
    });
  }
  async function loadDesign(ticket, id) {
    try {
      const { data, error } = await db.from("business_branding")
        .select("progress_emoji,empty_emoji").eq("business_id", id).maybeSingle();
      if (!current(ticket, id)) return;
      if (error) throw error;
      const design = window.LoyaltyProgress.normalize(data);
      $("progressFilledSymbol").value = design.progress_emoji;
      $("progressEmptySymbol").value = design.empty_emoji;
      $("progressDesignMessage").textContent = "";
      designForm.hidden = false;
      previewDesign();
    } catch (error) {
      if (current(ticket, id)) {
        message.textContent = "Recompensas cargadas. No se pudo cargar el diseño: " + error.message;
        $("retryRewardManager").hidden = false;
      }
    }
  }
  function edit(reward = null) {
    if (saving || !dialog.open || $("newManagedReward").hidden) return;
    selectedReward = reward?.id || null;
    $("rewardEditorTitle").textContent = reward ? "Editar recompensa" : "Nueva recompensa";
    $("managedRewardName").value = reward?.name || "";
    $("managedRewardDescription").value = reward?.description || "";
    $("managedRewardVisits").value = reward?.required_visits ?? 10;
    $("managedRewardActive").checked = reward ? reward.active === true : true;
    form.hidden = false;
    $("managedRewardName").focus();
  }
  async function open(id, name, afterChange = null) {
    if (saving || !id) return;
    selectedId = id;
    selectedReward = null;
    changed = false;
    onChange = afterChange;
    $("rewardManagerBusiness").textContent = name;
    if (!dialog.open) dialog.showModal();
    await refresh();
  }
  form.onsubmit = async event => {
    event.preventDefault();
    if (saving || form.hidden || !dialog.open) return;
    const id = selectedId;
    const rewardId = selectedReward;
    const ticket = revision;
    setBusy(true);
    message.textContent = "Guardando…";
    try {
      await persistReward(id, rewardId, {
        name: $("managedRewardName").value,
        description: $("managedRewardDescription").value,
        required_visits: $("managedRewardVisits").value,
        active: $("managedRewardActive").checked
      }, () => current(ticket, id));
      if (!current(ticket, id)) return;
      changed = true;
      await refresh();
      if (selectedId === id && dialog.open) {
        message.textContent = "Recompensa guardada." + (message.textContent ? " " + message.textContent : "");
      }
    } catch (error) {
      if (current(ticket, id)) message.textContent = error.message || "No se pudo guardar la recompensa.";
    } finally {
      setBusy(false);
    }
  };
  list.onclick = async event => {
    const button = event.target.closest("[data-edit-reward]");
    const reward = button && rows[Number(button.dataset.editReward)];
    if (reward) { edit(reward); return; }
    const toggle = event.target.closest("[data-reward-toggle]");
    const remove = event.target.closest("[data-reward-delete]");
    const target = toggle || remove;
    if (!target || saving || !dialog.open) return;
    const row = rows[Number(toggle ? target.dataset.rewardToggle : target.dataset.rewardDelete)];
    if (!row) return;
    const question = remove
      ? '¿Eliminar definitivamente "' + row.name + '"? No se puede deshacer. Si tiene canjes, solo podrás desactivarla.'
      : '¿' + (row.active ? "Desactivar" : "Reactivar") + ' "' + row.name + '"? Su historial se conservará.';
    if (!confirm(question)) return;
    const id = selectedId;
    const ticket = revision;
    setBusy(true);
    message.textContent = "Guardando…";
    try {
      if (remove) await removeReward(id, row.id, () => current(ticket, id));
      else await changeRewardState(id, row.id, !row.active, () => current(ticket, id));
      if (!current(ticket, id)) return;
      changed = true;
      await refresh();
      if (selectedId === id && dialog.open) {
        message.textContent = (remove ? "Recompensa eliminada." : "Estado actualizado.") +
          (message.textContent ? " " + message.textContent : "");
      }
    } catch (error) {
      if (current(ticket, id)) message.textContent = error.message || "No se pudo realizar el cambio.";
    } finally { setBusy(false); }
  };
  const presets = {
    stars: ["★", "☆"], camera: ["📷", "○"], christmas: ["🎄", "○"],
    halloween: ["🎃", "○"], love: ["❤️", "♡"]
  };
  designForm.addEventListener("click", event => {
    const button = event.target.closest("[data-progress-preset]");
    const symbols = button && presets[button.dataset.progressPreset];
    if (!symbols || saving) return;
    [$("progressFilledSymbol").value, $("progressEmptySymbol").value] = symbols;
    previewDesign();
  });
  $("progressFilledSymbol").oninput = previewDesign;
  $("progressEmptySymbol").oninput = previewDesign;
  designForm.onsubmit = async event => {
    event.preventDefault();
    if (saving || designForm.hidden || !dialog.open) return;
    const id = selectedId;
    const ticket = revision;
    setBusy(true);
    $("progressDesignMessage").textContent = "Guardando diseño…";
    try {
      await persistProgressDesign(id, {
        progress_emoji: $("progressFilledSymbol").value,
        empty_emoji: $("progressEmptySymbol").value
      }, () => current(ticket, id));
      if (!current(ticket, id)) return;
      changed = true;
      $("progressDesignMessage").textContent = "Diseño guardado. Se verá al volver a abrir o recargar las tarjetas.";
    } catch (error) {
      if (current(ticket, id)) $("progressDesignMessage").textContent = error.message || "No se pudo guardar.";
    } finally { setBusy(false); }
  };
  $("newManagedReward").onclick = () => edit();
  $("retryRewardManager").onclick = () => refresh();
  $("cancelRewardEdit").onclick = () => { if (!saving) form.hidden = true; };
  async function finish() {
    if (saving) return;
    const id = selectedId;
    const refreshParent = onChange;
    const didChange = changed;
    close();
    if (didChange) {
      if (businessId === id && !$("app").hidden) await load();
      if (refreshParent) await refreshParent();
    }
    await syncPermission();
  }
  $("closeRewardManager").onclick = finish;
  dialog.addEventListener("cancel", event => { event.preventDefault(); finish(); });
  $("editBusinessRewards").onclick = () => open(businessId, $("biz").textContent);
  syncPermission();
  return { open, close, syncPermission };
})();
