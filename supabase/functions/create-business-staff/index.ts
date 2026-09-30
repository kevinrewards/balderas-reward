import { createClient } from "npm:@supabase/supabase-js@2";

// Archivo autónomo: pegar completo en create-business-staff.
const targetRole = "staff";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Método no permitido" }, 405);
  let invitationSent = false;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Falta configuración del servidor");
    // Ambos correos usan la misma dirección, configurada únicamente en el servidor.
    const base = new URL(Deno.env.get("PUBLIC_APP_URL") || "https://balderas-reward.netlify.app/");
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
      throw new Error("PUBLIC_APP_URL debe ser una dirección HTTPS del sitio");
    }
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    const redirectTo = new URL("accept-invite.html", base).href;
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ success: false, error: "Debes iniciar sesión" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const identity = await userClient.auth.getUser();
    if (identity.error || !identity.data.user) return json({ success: false, error: "Sesión no válida" }, 401);
    const actor = identity.data.user.id;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const body = await req.json();
    const businessId = String(body.business_id || "").trim();
    const name = String(body[targetRole + "_name"] || "").trim();
    const email = String(body[targetRole + "_email"] || "").trim().toLowerCase();
    if (!businessId) throw new Error("Falta el negocio");
    if (!name) throw new Error("El nombre es obligatorio");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Escribe un correo válido");

    const platform = await admin.from("platform_admins").select("user_id").eq("user_id", actor).maybeSingle();
    if (platform.error) throw new Error("No se pudieron verificar los permisos");
    const actorProfile = await admin.from("profiles").select("active").eq("user_id", actor).maybeSingle();
    if (actorProfile.error) throw new Error("No se pudo verificar el perfil");
    if (actorProfile.data?.active === false) throw new Error("Tu cuenta está desactivada");
    if (!platform.data) {
      if (targetRole === "owner") throw new Error("Acceso exclusivo para Superadmin");
      const membership = await admin.from("business_members").select("role,active")
        .eq("business_id", businessId).eq("user_id", actor).maybeSingle();
      if (membership.error) throw new Error("No se pudieron verificar los permisos del negocio");
      if (membership.data?.role !== "owner" || membership.data?.active !== true) {
        throw new Error("No tienes permiso para agregar personal");
      }
    }
    const business = await admin.from("businesses").select("id,name,active").eq("id", businessId).maybeSingle();
    if (business.error || !business.data) throw new Error("Negocio no encontrado");
    if (business.data.active !== true) throw new Error("El negocio está desactivado");

    // Buscar todas las páginas, sin limitar la búsqueda a las primeras 1,000 cuentas.
    let targetUser = null;
    for (let page = 1; ; page++) {
      const listed = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listed.error) throw new Error("No se pudieron consultar las cuentas");
      const users = listed.data.users;
      targetUser = users.find(user => user.email?.toLowerCase() === email) || null;
      if (targetUser || users.length < 1000) break;
    }
    const existingUser = !!targetUser;
    if (targetUser) {
      const profile = await admin.from("profiles").select("active").eq("user_id", targetUser.id).maybeSingle();
      if (profile.error) throw new Error("No se pudo verificar el perfil de la cuenta");
      if (profile.data?.active === false) throw new Error("La cuenta está desactivada. Solicita su reactivación al Superadmin");
      const member = await admin.from("business_members").select("role,active")
        .eq("business_id", businessId).eq("user_id", targetUser.id).maybeSingle();
      if (member.error) throw new Error("No se pudo verificar la membresía existente");
      if (targetRole === "staff" && member.data && member.data.role !== "staff") {
        throw new Error("Esta cuenta ya es Owner del negocio. Se conserva su rol; no se puede agregar como Staff");
      }
      if (member.data && member.data.active !== true) {
        throw new Error("Esta membresía está desactivada. Usa la opción Reactivar antes de reenviar el acceso");
      }
      const mailClient = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const recovery = await mailClient.auth.resetPasswordForEmail(email, { redirectTo });
      if (recovery.error) throw recovery.error;
    } else {
      const invited = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: name }, redirectTo,
      });
      if (invited.error) throw invited.error;
      targetUser = invited.data.user;
      invitationSent = true;
    }
    if (!targetUser) throw new Error("No se pudo obtener la cuenta");

    // Crear el perfil solo si falta: nunca reactivar ni renombrar uno existente.
    const savedProfile = await admin.from("profiles").upsert({
      user_id: targetUser.id, full_name: name, active: true,
    }, { onConflict: "user_id", ignoreDuplicates: true });
    if (savedProfile.error) throw savedProfile.error;
    // Releer también protege el caso de un perfil creado por un trigger de Auth.
    const currentProfile = await admin.from("profiles").select("active").eq("user_id", targetUser.id).maybeSingle();
    if (currentProfile.error || currentProfile.data?.active !== true) {
      throw new Error("El perfil no está activo; no se asignó acceso al negocio");
    }

    const inserted = await admin.from("business_members").upsert({
      business_id: businessId, user_id: targetUser.id, role: targetRole, active: true,
    }, { onConflict: "business_id,user_id", ignoreDuplicates: true });
    if (inserted.error) throw inserted.error;
    // No sobrescribir una membresía que apareció mientras se enviaba el correo.
    // Solo Superadmin puede promover un Staff ACTIVO al solicitar asignarlo como Owner.
    if (targetRole === "owner") {
      const promoted = await admin.from("business_members").update({ role: "owner" })
        .eq("business_id", businessId).eq("user_id", targetUser.id).eq("role", "staff").eq("active", true);
      if (promoted.error) throw promoted.error;
    }
    const saved = await admin.from("business_members").select("role,active")
      .eq("business_id", businessId).eq("user_id", targetUser.id).maybeSingle();
    if (saved.error || saved.data?.role !== targetRole || saved.data?.active !== true) {
      throw new Error("La membresía cambió o está desactivada. No se sobrescribió; revisa el personal del negocio");
    }
    return json({
      success: true, existing_user: existingUser,
      business_id: business.data.id, business_name: business.data.name,
      [targetRole + "_id"]: targetUser.id,
      [targetRole + "_name"]: name,
      [targetRole + "_email"]: email,
      role: targetRole,
    });
  } catch (error) {
    return json({
      success: false,
      error: (error instanceof Error ? error.message : error?.message || "Error inesperado") +
        (invitationSent ? ". La invitación ya se envió, pero la asignación no se completó; revisa el negocio antes de reenviar" : ""),
    }, 400);
  }
});
