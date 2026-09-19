/* Business-scoped Superadmin console. Server-side permissions remain authoritative. */
const businessControl = (() => {
  const panel = $("businessControlPanel");
  const message = $("businessManageMessage");
  const tabs = {
    owners: $("businessManageOwners"),
    staff: $("businessManageStaff"),
    customers: $("businessManageCustomers"),
    rewards: $("businessManageRewards"),
    branding: $("businessManageBranding")
  };
  let revision = 0;
  let activeTab = "owners";
  let members = [];
  let busy = false;
  const html = escapeHtml;
  const empty = text => '<p class="muted">' + html(text) + '</p>';
  const item = (title, detail) => '<article class="businessAdminItem"><strong>' +
    html(title) + '</strong><p class="muted">' + html(detail) + '</p></article>';

  async function requireAdmin() {
    const { data, error } = await db.rpc("is_platform_admin");
    if (error || data !== true) throw new Error("No se pudo verificar tu acceso de Superadmin.");
  }

  function isCurrent(ticket, id) {
    return ticket === revision && selectedBusinessManage?.businessId === id &&
      !$("businessManageModal").hidden;
  }

  async function show(tab) {
    if (!tabs[tab] || busy || !selectedBusinessManage || !currentIsSuperAdmin) return;
    const id = selectedBusinessManage.businessId;
    const ticket = ++revision;
    activeTab = tab;
    members = [];
    for (const [key, button] of Object.entries(tabs)) {
      button.setAttribute("aria-pressed", String(key === tab));
    }
    message.textContent = "";
    panel.innerHTML = empty("Cargando…");
    try {
      await requireAdmin();
      if (!isCurrent(ticket, id)) return;
      let result;
      if (tab === "owners" || tab === "staff") {
        result = await db.rpc("list_business_members", { target_business_id: id });
      } else if (tab === "customers") {
        result = await db.from("customers").select("id,name,active")
          .eq("business_id", id).order("name");
      } else if (tab === "rewards") {
        result = await db.from("rewards").select("id,name,description,required_visits,active")
          .eq("business_id", id).order("required_visits");
      } else {
        result = await db.from("business_branding")
          .select("program_name,progress_goal,progress_emoji,empty_emoji,primary_color,background_color,welcome_text")
          .eq("business_id", id).maybeSingle();
      }
      if (!isCurrent(ticket, id)) return;
      if (result.error) throw result.error;
      if (tab === "owners" || tab === "staff") {
        members = (result.data || []).filter(member => member.role === (tab === "owners" ? "owner" : "staff"));
        panel.innerHTML = members.map((member, index) =>
          '<article class="businessAdminItem"><strong>' + html(member.full_name || "Sin nombre") +
          '</strong><p class="muted">' + html(member.email || "Sin correo") +
          '</p><p>' + (member.active ? "Activo" : "Inactivo") +
          '</p><div class="staffActions"><button type="button" class="secondary" data-control-member="' +
          index + '" data-control-action="' + (member.active ? "deactivate" : "reactivate") + '">' +
          (member.active ? "Desactivar" : "Reactivar") +
          '</button><button type="button" class="dangerButton" data-control-member="' +
          index + '" data-control-action="remove">Quitar del negocio</button></div></article>'
        ).join("") || empty(tab === "owners" ? "No hay Owners vinculados." : "No hay Staff vinculado.");
      } else if (tab === "customers") {
        panel.innerHTML = (result.data || []).map(customer =>
          item(customer.name, customer.active ? "Cliente activo" : "Cliente inactivo")
        ).join("") || empty("No hay clientes registrados.");
      } else if (tab === "rewards") {
        panel.innerHTML = empty("Consulta de recompensas. La edición se habilitará después de verificar los permisos de Supabase.") +
          ((result.data || []).map(reward => item(reward.name,
            reward.required_visits + " visitas · " + (reward.active ? "Activa" : "Inactiva") +
            (reward.description ? " · " + reward.description : "")
          )).join("") || empty("No hay recompensas configuradas."));
      } else {
        const branding = result.data;
        panel.innerHTML = empty("Configuración actual (solo consulta).") +
          (branding ? [
            ["Programa", branding.program_name],
            ["Meta de visitas", branding.progress_goal],
            ["Símbolo de progreso", branding.progress_emoji],
            ["Símbolo pendiente", branding.empty_emoji],
            ["Color principal", branding.primary_color],
            ["Color de fondo", branding.background_color],
            ["Bienvenida", branding.welcome_text]
          ].map(([label, value]) => item(label, value ?? "Sin configurar")).join("") :
          empty("No hay personalización guardada."));
      }
    } catch (error) {
      if (!isCurrent(ticket, id)) return;
      panel.innerHTML = empty("No se pudo cargar esta sección.") +
        '<button type="button" data-control-retry>Reintentar</button>';
      message.textContent = error.message || "Error de conexión.";
    }
  }

  panel.addEventListener("click", async event => {
    if (event.target.closest("[data-control-retry]")) { await show(activeTab); return; }
    const button = event.target.closest("[data-control-member]");
    if (!button || busy || !currentIsSuperAdmin || $("businessManageModal").hidden) return;
    const member = members[Number(button.dataset.controlMember)];
    const action = button.dataset.controlAction;
    if (!member || !["deactivate", "reactivate", "remove"].includes(action)) return;
    const id = selectedBusinessManage?.businessId;
    if (!id) return;
    const verb = { deactivate: "Desactivar", reactivate: "Reactivar", remove: "Quitar del negocio a" }[action];
    if (!confirm(verb + " " + (member.full_name || member.email) + " en " +
      selectedBusinessManage.businessName + "?" +
      (action === "remove" ? "\nSe usará la función existente para quitar la vinculación al negocio." : ""))) return;
    const ticket = revision;
    busy = true;
    for (const control of panel.querySelectorAll("button")) control.disabled = true;
    for (const control of Object.values(tabs)) control.disabled = true;
    $("closeBusinessManage").disabled = true;
    message.textContent = "Guardando…";
    try {
      await requireAdmin();
      if (!isCurrent(ticket, id)) return;
      const { error } = await db.rpc("manage_business_member", {
        target_business_id: id,
        target_user_id: member.user_id,
        requested_action: action
      });
      if (error) throw error;
      if (!isCurrent(ticket, id)) return;
      busy = false;
      await show(activeTab);
      if (selectedBusinessManage?.businessId === id && !$("businessManageModal").hidden) {
        if (!message.textContent) message.textContent = "Cambio guardado.";
      }
      // Keep the underlying staff panel consistent only when it shows the same business.
      if (businessId === id) await loadBusinessStaff();
    } catch (error) {
      if (isCurrent(ticket, id)) message.textContent = error.message || "No se pudo guardar el cambio.";
    } finally {
      busy = false;
      for (const control of panel.querySelectorAll("button")) control.disabled = false;
      for (const control of Object.values(tabs)) control.disabled = false;
      $("closeBusinessManage").disabled = false;
    }
  });

  for (const [tab, button] of Object.entries(tabs)) button.onclick = () => show(tab);
  return {
    open() { busy = false; return show("owners"); },
    close() { ++revision; members = []; panel.innerHTML = ""; message.textContent = ""; }
  };
})();
