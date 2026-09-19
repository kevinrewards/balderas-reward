const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

export async function handleLifecycle(request, clients) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply(405, { error: "Usa POST." });
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply(401, { error: "Inicia sesión." });
  try {
    const user = clients.userClient(authorization);
    const identity = await user.auth.getUser();
    if (identity.error || !identity.data?.user) return reply(401, { error: "Sesión inválida." });
    const admin = await user.rpc("is_platform_admin");
    if (admin.error || admin.data !== true) return reply(403, { error: "Solo Superadmin." });
    let body;
    try { body = await request.json(); } catch { return reply(400, { error: "Solicitud inválida." }); }
    if (!body || !["delete_business", "remove_owner", "deactivate", "reactivate", "retry"].includes(body.action)) {
      return reply(400, { error: "Acción inválida." });
    }
    let result = { action: "retry", queued_accounts: [] };
    if (body.action !== "retry") {
      const action = await user.rpc("admin_lifecycle_action", {
        target_business_id: body.business_id,
        target_user_id: body.user_id || null,
        requested_action: body.action,
        confirmation: body.confirmation || "",
        expected_version: body.version || "",
      });
      if (action.error) return reply(400, { error: action.error.message });
      result = action.data;
    }
    // The database action is already committed. Never report it as failed just
    // because Auth cleanup failed; the durable queue makes cleanup retryable.
    const accounts = [];
    try {
      const pending = body.action === "retry" ? await user.rpc("admin_pending_retirements") : { data: result.queued_accounts };
      if (pending.error) throw pending.error;
      if ((pending.data || []).length) {
        const service = clients.serviceClient();
        for (const id of pending.data) {
          try {
            // Only process server-issued queue entries, never arbitrary request IDs.
            const entry = await service.from("admin_account_retirements").select("user_id,completed_at").eq("user_id", id).single();
            if (entry.error || !entry.data) throw new Error("No se pudo verificar la baja pendiente.");
            if (!entry.data.completed_at) {
              // Soft deletion retains IDs referenced by historical visits/canjes.
              const deleted = await service.auth.admin.deleteUser(id, true);
              if (deleted.error) throw deleted.error;
              const saved = await service.from("admin_account_retirements")
                .update({ completed_at: new Date().toISOString() }).eq("user_id", id);
              if (saved.error) throw saved.error;
            }
            accounts.push({ user_id: id, completed: true });
          } catch {
            accounts.push({ user_id: id, completed: false });
          }
        }
      }
    } catch {
      return reply(200, { ...result, accounts, cleanup_pending: true });
    }
    return reply(200, { ...result, accounts, cleanup_pending: accounts.some(a => !a.completed) });
  } catch {
    return reply(500, { error: "No se pudo completar la solicitud. Actualiza las listas antes de reintentar." });
  }
}
