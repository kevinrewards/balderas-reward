const db = supabase.createClient(
  "https://aitupbowuekcfdqsksny.supabase.co",
  "sb_publishable_BuJU2ZgKkAcF39JpL_SaaA_oTmHfW9Z"
);

const $ = id => document.getElementById(id);

let businessId = null;
let rewards = [];

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));

function makeStars(number) {
  const completed = Math.min(Math.max(number, 0), 10);

  return Array.from(
    { length: 10 },
    (_, i) => i < completed ? "★" : "☆"
  ).join("");
}

function loginView() {
  $("login").hidden = false;
  $("app").hidden = true;
}

function appView() {
  $("login").hidden = true;
  $("app").hidden = false;
}

/* INICIAR SESIÓN */

$("form").onsubmit = async e => {
  e.preventDefault();

  $("msg").textContent = "Ingresando…";

  const { error } = await db.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value
  });

  if (error) {
    $("msg").textContent = "Error: " + error.message;
    return;
  }

  $("msg").textContent = "";
  await load();
};

/* CERRAR SESIÓN */

$("logout").onclick = async () => {
  await db.auth.signOut();
  loginView();
};

/* NUEVO CLIENTE */

$("newClient").onclick = () => {
  $("clientDialog").showModal();
};

$("cancelClient").onclick = () => {
  $("clientDialog").close();
};

$("clientForm").onsubmit = async e => {
  e.preventDefault();

  const name = $("clientName").value.trim();

  if (!name) return;

  const payload = {
    business_id: businessId,
    name: name,
    phone: $("clientPhone").value.trim() || null,
    email: $("clientEmail").value.trim() || null
  };

  const { error } = await db
    .from("customers")
    .insert(payload);

  if (error) {
    alert("No se pudo crear el cliente: " + error.message);
    return;
  }

  $("clientForm").reset();
  $("clientDialog").close();

  await load();
};

/* REGISTRAR VISITA */

async function addVisit(customerId) {

  if (!confirm("¿Registrar una nueva visita para este cliente?")) {
    return;
  }

  const { error } = await db.rpc(
    "register_visit",
    {
      target_customer_id: customerId
    }
  );

  if (error) {
    alert("No se pudo registrar la visita: " + error.message);
    return;
  }

  await load();
}

/* CANJEAR RECOMPENSA */

async function redeem(customerId, rewardId, rewardName) {

  if (
    !confirm(
      "¿Canjear \"" +
      rewardName +
      "\"? El canje quedará registrado."
    )
  ) {
    return;
  }

  const { error } = await db.rpc(
    "redeem_reward",
    {
      target_customer_id: customerId,
      target_reward_id: rewardId
    }
  );

  if (error) {
    alert("No se pudo canjear: " + error.message);
    return;
  }

  alert("Recompensa canjeada correctamente.");

  await load();
}

/* CARGAR DATOS */

async function load() {

  appView();

  $("status").textContent = "Sincronizando…";

  const membership = await db
    .from("business_members")
    .select("business_id")
    .limit(1);

  if (
    membership.error ||
    !membership.data ||
    !membership.data.length
  ) {
    $("status").textContent =
      "No encontré un negocio vinculado.";
    return;
  }

  businessId = membership.data[0].business_id;

  const [business, customers, visits, rewardData, redemptions] =
    await Promise.all([

      db
        .from("businesses")
        .select("name")
        .eq("id", businessId)
        .single(),

      db
        .from("customers")
        .select("id,name")
        .eq("business_id", businessId)
        .eq("active", true)
        .order("created_at"),

      db
        .from("visits")
        .select("id,customer_id")
        .eq("business_id", businessId),

      db
        .from("rewards")
        .select(
          "id,name,description,required_visits"
        )
        .eq("business_id", businessId)
        .eq("active", true)
        .order("required_visits"),

      db
        .from("redemptions")
        .select("customer_id,visits_spent")
        .eq("business_id", businessId)

    ]);

  const error =
    business.error ||
    customers.error ||
    visits.error ||
    rewardData.error ||
    redemptions.error;

  if (error) {
    $("status").textContent =
      "Error: " + error.message;
    return;
  }

  $("biz").textContent = business.data.name;

  const customerList = customers.data || [];
  const visitList = visits.data || [];

  rewards = rewardData.data || [];

  const redemptionList = redemptions.data || [];

  $("cc").textContent = customerList.length;
  $("vc").textContent = visitList.length;
  $("rc").textContent = rewards.length;

  const totalVisits = {};
  const spentVisits = {};

  visitList.forEach(v => {
    totalVisits[v.customer_id] =
      (totalVisits[v.customer_id] || 0) + 1;
  });

  redemptionList.forEach(r => {
    spentVisits[r.customer_id] =
      (spentVisits[r.customer_id] || 0) +
      r.visits_spent;
  });

  $("customers").innerHTML =
    customerList.map(customer => {

      const available =
        Math.max(
          (totalVisits[customer.id] || 0) -
          (spentVisits[customer.id] || 0),
          0
        );

      const visualProgress =
        Math.min(available, 10);

      const rewardStatus =
        rewards.map(reward => {

          const missing =
            Math.max(
              reward.required_visits - available,
              0
            );

          if (missing === 0) {

            return `
              <div class="rewardState ready">

                🎁 ${esc(reward.name)}
                — Disponible

                <button
                  onclick="redeem(
                    '${customer.id}',
                    '${reward.id}',
                    '${esc(reward.name)}'
                  )">
                  Canjear
                </button>

              </div>
            `;
          }

          return `
            <div class="rewardState">

              🔒 ${esc(reward.name)}
              — faltan ${missing} visita(s)

            </div>
          `;

        }).join("");

      return `

        <div class="item">

          <div class="row">

            <div>

              <b>${esc(customer.name)}</b>

              <br>

              <span class="muted">
                ${available} visita(s) disponible(s)
              </span>

            </div>

            <span class="badge">
              ${visualProgress}/10
            </span>

          </div>

          <div
            class="stars"
            aria-label="${visualProgress} de 10 visitas">

            ${makeStars(visualProgress)}

          </div>

          ${rewardStatus}

          <div class="customerActions">

            <button
              onclick="addVisit('${customer.id}')">

              + Registrar visita

            </button>

          </div>

        </div>
      `;

    }).join("") ||

    `<p class="muted">
       Aún no hay clientes.
     </p>`;

  $("rewards").innerHTML =
    rewards.map(reward => `

      <div class="item row">

        <div>

          <b>${esc(reward.name)}</b>

          <br>

          <span class="muted">
            ${esc(reward.description || "")}
          </span>

        </div>

        <span class="badge">
          ${reward.required_visits} visitas
        </span>

      </div>

    `).join("");

  $("status").textContent =
    "Datos sincronizados con Supabase.";
}

/* COMPROBAR SESIÓN */

(async () => {

  const {
    data: { session }
  } = await db.auth.getSession();

  if (session) {
    await load();
  } else {
    loginView();
  }

})();
