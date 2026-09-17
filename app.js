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

/* CREA LAS ESTRELLAS */
function makeStars(completed, total = 10) {

  completed = Math.min(
    Math.max(completed, 0),
    total
  );

  return Array.from(
    { length: total },
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

  const { error } =
    await db.auth.signInWithPassword({

      email: $("email").value.trim(),
      password: $("password").value

    });

  if (error) {

    $("msg").textContent =
      "Error: " + error.message;

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

  const name =
    $("clientName").value.trim();

  if (!name) return;

  const payload = {

    business_id: businessId,

    name: name,

    phone:
      $("clientPhone").value.trim() || null,

    email:
      $("clientEmail").value.trim() || null

  };

  const { error } =
    await db
      .from("customers")
      .insert(payload);

  if (error) {

    alert(
      "No se pudo crear el cliente: " +
      error.message
    );

    return;
  }

  $("clientForm").reset();

  $("clientDialog").close();

  await load();
};

/* REGISTRAR VISITA */

async function addVisit(customerId) {

  if (
    !confirm(
      "¿Registrar una nueva visita para este cliente?"
    )
  ) {
    return;
  }

  const { error } =
    await db.rpc(
      "register_visit",
      {
        target_customer_id: customerId
      }
    );

  if (error) {

    alert(
      "No se pudo registrar la visita: " +
      error.message
    );

    return;
  }

  await load();
}

/* CANJEAR RECOMPENSA */

async function redeem(
  customerId,
  rewardId,
  rewardName
) {

  if (
    !confirm(
      '¿Canjear "' +
      rewardName +
      '"? El canje quedará registrado.'
    )
  ) {
    return;
  }

  const { error } =
    await db.rpc(
      "redeem_reward",
      {
        target_customer_id: customerId,
        target_reward_id: rewardId
      }
    );

  if (error) {

    alert(
      "No se pudo canjear: " +
      error.message
    );

    return;
  }

  alert(
    "Recompensa canjeada correctamente."
  );

  await load();
}
function getCardURL(token) {
  return (
    window.location.origin +
    window.location.pathname
      .replace(/index\.html$/, "")
      .replace(/\/$/, "") +
    "/card.html?token=" +
    encodeURIComponent(token)
  );
}

function openCard(token) {

  if (!token) {
    alert("Este cliente todavía no tiene tarjeta.");
    return;
  }

  window.open(
    getCardURL(token),
    "_blank"
  );
}

async function shareCard(token, customerName) {

  if (!token) {
    alert("Este cliente todavía no tiene tarjeta.");
    return;
  }

  const url = getCardURL(token);

  const text =
    "Hola " + customerName +
    " 👋\n\n" +
    "Esta es tu tarjeta digital de lealtad de " +
    $("biz").textContent +
    ".\n\n" +
    "Aquí puedes consultar tus visitas y recompensas.";

  if (navigator.share) {

    try {

      await navigator.share({
        title: "Tu tarjeta de lealtad",
        text: text,
        url: url
      });

      return;

    } catch (error) {

      if (error.name === "AbortError") {
        return;
      }

    }

  }

  try {

    await navigator.clipboard.writeText(
      text + "\n\n" + url
    );

    alert(
      "Enlace de la tarjeta copiado."
    );

  } catch {

    prompt(
      "Copia el enlace de la tarjeta:",
      url
    );

  }

}
/* CARGAR DATOS */

async function load() {

  appView();
const { data: adminCheck, error: adminCheckError } =
  await db.rpc("is_platform_admin");

const isSuperAdmin =
  !adminCheckError && adminCheck === true;

console.log(
  "BALDERAS Superadmin:",
  isSuperAdmin
);
  const superAdminSection =
  $("superAdminSection");

if (superAdminSection) {

  superAdminSection.hidden =
    !isSuperAdmin;

}
  $("status").textContent =
    "Sincronizando…";

  const membership =
    await db
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

  businessId =
    membership.data[0].business_id;

  const [
    business,
    customers,
    visits,
    rewardData,
    redemptions
  ] = await Promise.all([

    db
      .from("businesses")
      .select("name")
      .eq("id", businessId)
      .single(),

    db
      .from("customers")
      .select("id,name,qr_token")
      .eq("business_id",businessId)
      .eq("active", true)
      .order("created_at"),

    db
  .from("visits")
  .select("id,customer_id,created_at")
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
      .select(
        "customer_id,visits_spent"
      )
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

  $("biz").textContent =
    business.data.name;

  const customerList =
    customers.data || [];

  const visitList =
    visits.data || [];

  rewards =
    rewardData.data || [];

  const redemptionList =
    redemptions.data || [];

  $("cc").textContent =
    customerList.length;

  updateVisitCounter(visitList);

  $("rc").textContent =
    rewards.length;

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

      /* RECOMPENSAS CON ESTRELLAS */

      const rewardStatus =
        rewards.map(reward => {

          const required =
            reward.required_visits;

          const completed =
            Math.min(
              available,
              required
            );

          const unlocked =
            available >= required;

          return `

            <div class="rewardProgress">

              <div class="rewardTitle">

                🎁 ${esc(reward.name)}

              </div>

              <div class="rewardStars">

                ${makeStars(
                  completed,
                  required
                )}

              </div>

              <div class="rewardCounter">

                ${completed}/${required}

              </div>

              ${
                unlocked
                ? `

                  <div class="rewardAvailable">

                    Recompensa disponible

                  </div>

                  <button
                    class="redeemButton"
                    onclick="redeem(
                      '${customer.id}',
                      '${reward.id}',
                      '${esc(reward.name)}'
                    )">

                    Canjear recompensa

                  </button>

                `
                : ""
              }

            </div>

          `;

        }).join("");

      return `

        <div class="item">

          <div class="row">

            <div>

              <b>
                ${esc(customer.name)}
              </b>

              <br>

              <span class="muted">

                ${available}
                visita(s) disponible(s)

              </span>

            </div>

            <span class="badge">

              ${visualProgress}/10

            </span>

          </div>

          <div class="stars">

            ${makeStars(
              visualProgress,
              10
            )}

          </div>

          ${rewardStatus}

          <div class="customerActions">

  <button onclick="addVisit('${customer.id}')">
    + Registrar visita
  </button>

  <button
    class="secondary"
    onclick="openCard('${customer.qr_token}')">
    📱 Ver tarjeta
  </button>

  <button
    class="secondary"
    onclick="shareCard('${customer.qr_token}','${esc(customer.name)}')">
    🔗 Compartir tarjeta
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

          <b>
            ${esc(reward.name)}
          </b>

          <br>

          <span class="muted">

            ${esc(
              reward.description || ""
            )}

          </span>

        </div>

        <span class="badge">

          ${reward.required_visits}
          visitas

        </span>

      </div>

    `).join("");

  $("status").textContent =
    "Datos sincronizados con Supabase.";
}
/* CONTADOR DE VISITAS POR PERIODO */

let currentVisitList = [];

function updateVisitCounter(visits) {

  currentVisitList = visits;

  const period =
    $("visitPeriod").value;

  const now = new Date();

  let filtered = visits;

  if (period === "today") {

    filtered = visits.filter(visit => {

      const date =
        new Date(visit.created_at);

      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      );

    });

  }

  if (period === "week") {

    const start =
      new Date(now);

    const day =
      start.getDay();

    const difference =
      day === 0 ? -6 : 1 - day;

    start.setDate(
      start.getDate() + difference
    );

    start.setHours(0, 0, 0, 0);

    filtered = visits.filter(visit => {

      return (
        new Date(visit.created_at) >= start
      );

    });

  }

  if (period === "month") {

    filtered = visits.filter(visit => {

      const date =
        new Date(visit.created_at);

      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      );

    });

  }

  $("vc").textContent =
    filtered.length;
}

$("visitPeriod").onchange = () => {

  updateVisitCounter(
    currentVisitList
  );

};
// Evita que textos ingresados por usuarios
// puedan convertirse en código HTML
function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}
// ==========================================
// BALDERAS SUPERADMIN - NEGOCIOS
// ==========================================

async function openBusinessAdmin() {

  const modal = $("businessAdminModal");
  const list = $("businessAdminList");

  if (!modal || !list) return;

  modal.hidden = false;
  list.innerHTML = "<p>Cargando negocios...</p>";

  const { data, error } =
    await db.rpc("admin_list_businesses");

  if (error) {

    console.error(error);

    list.innerHTML = `
      <p class="error">
        No se pudieron cargar los negocios.
      </p>
    `;

    return;
  }

  if (!data || data.length === 0) {

    list.innerHTML = `
      <div class="businessAdminEmpty">
        Todavía no hay negocios registrados.
      </div>
    `;

    return;
  }

  list.innerHTML = data.map(business => `

    <div class="businessAdminItem">

      <div class="businessAdminTop">

        <div>
          <strong>
            ${escapeHtml(business.business_name)}
          </strong>

          <div class="muted">
            ${escapeHtml(business.business_slug)}
          </div>
        </div>

        <span class="businessStatus">
          ${business.business_active
            ? "● ACTIVO"
            : "○ INACTIVO"}
        </span>

      </div>

      <div class="businessAdminInfo">

        <div>
          <span>OWNER</span>
          <strong>
            ${business.owner_name
              ? escapeHtml(business.owner_name)
              : "Sin asignar"}
          </strong>
        </div>

        <div>
          <span>CLIENTES</span>
          <strong>
            ${business.customer_count}
          </strong>
        </div>

      </div>

      <button
        type="button"
        class="secondary businessManageButton"
        data-business-id="${business.business_id}">
        Administrar
      </button>

    </div>

  `).join("");
}


// Abrir negocios
const manageBusinessesButton =
  $("manageBusinesses");

if (manageBusinessesButton) {

  manageBusinessesButton.onclick =
    openBusinessAdmin;

}


// Cerrar negocios
const closeBusinessAdminButton =
  $("closeBusinessAdmin");

if (closeBusinessAdminButton) {

  closeBusinessAdminButton.onclick = () => {
    $("businessAdminModal").hidden = true;
  };

}
// ==========================================
// BALDERAS SUPERADMIN - NUEVO NEGOCIO
// VISTA PREVIA EN VIVO
// ==========================================

function updateBusinessPreview() {

  const name =
    $("newBusinessName")?.value.trim()
    || "NUEVO NEGOCIO";

  const program =
    $("newProgramName")?.value.trim()
    || "Tarjeta de Lealtad";

  const progressEmoji =
    $("newProgressEmoji")?.value
    || "★";

  const emptyEmoji =
    $("newEmptyEmoji")?.value
    || "☆";

  const goal =
    Math.max(
      1,
      Math.min(
        100,
        Number(
          $("newProgressGoal")?.value
        ) || 10
      )
    );

  const primaryColor =
    $("newPrimaryColor")?.value
    || "#E1B85D";

  const backgroundColor =
    $("newBackgroundColor")?.value
    || "#0D0D0E";


  const completed =
    Math.min(
      Math.ceil(goal / 2),
      goal
    );


  $("businessPreviewName").textContent =
    name;

  $("businessPreviewProgram").textContent =
    program;


  const progress =
    Array.from(
      { length: goal },
      (_, index) =>
        index < completed
          ? progressEmoji
          : emptyEmoji
    ).join("");


  $("businessPreviewProgress").textContent =
    progress;


  $("businessPreviewCounter").textContent =
    `${completed} / ${goal} visitas`;


  $("businessPreview").style.background =
    backgroundColor;


  $("businessPreview").style.borderColor =
    primaryColor;


  $("businessPreviewName").style.color =
    primaryColor;


  $("businessPreviewProgram").style.color =
    primaryColor;


  $("businessPreviewCounter").style.color =
    primaryColor;

}


// ------------------------------------------
// LOGOTIPO - VISTA PREVIA
// ------------------------------------------

function previewBusinessLogo(file) {

  const preview =
    $("businessPreviewLogo");

  if (!preview) return;


  if (!file) {

    preview.innerHTML = "LOGO";

    return;
  }


  if (!file.type.startsWith("image/")) {

    alert(
      "Selecciona una imagen válida."
    );

    return;
  }


  const reader =
    new FileReader();


  reader.onload = event => {

    preview.innerHTML = "";

    const image =
      document.createElement("img");

    image.src =
      event.target.result;

    image.alt =
      "Vista previa del logotipo";

    preview.appendChild(image);

  };


  reader.readAsDataURL(file);

}


// ------------------------------------------
// ABRIR ASISTENTE
// ------------------------------------------

function openNewBusinessModal() {

  const modal =
    $("newBusinessModal");

  if (!modal) return;


  modal.hidden = false;

  updateBusinessPreview();

}


// ------------------------------------------
// CERRAR ASISTENTE
// ------------------------------------------

function closeNewBusinessModal() {

  const modal =
    $("newBusinessModal");

  if (!modal) return;


  modal.hidden = true;

}


// ------------------------------------------
// BOTONES
// ------------------------------------------

const createBusinessMainButton =
  $("createBusiness");

if (createBusinessMainButton) {

  createBusinessMainButton.onclick =
    openNewBusinessModal;

}


const createBusinessListButton =
  $("newBusinessFromList");

if (createBusinessListButton) {

  createBusinessListButton.onclick = () => {

    $("businessAdminModal").hidden = true;

    openNewBusinessModal();

  };

}


const closeNewBusinessButton =
  $("closeNewBusiness");

if (closeNewBusinessButton) {

  closeNewBusinessButton.onclick =
    closeNewBusinessModal;

}


// ------------------------------------------
// CAMPOS QUE ACTUALIZAN LA VISTA PREVIA
// ------------------------------------------

[
  "newBusinessName",
  "newProgramName",
  "newProgressEmoji",
  "newEmptyEmoji",
  "newProgressGoal",
  "newPrimaryColor",
  "newBackgroundColor"
].forEach(id => {

  const input = $(id);

  if (input) {

    input.addEventListener(
      "input",
      updateBusinessPreview
    );

  }

});


// ------------------------------------------
// CAMBIO DE LOGOTIPO
// ------------------------------------------

const newBusinessLogoInput =
  $("newBusinessLogo");

if (newBusinessLogoInput) {

  newBusinessLogoInput.addEventListener(
    "change",
    event => {

      const file =
        event.target.files?.[0];

      previewBusinessLogo(file);

    }
  );

}
// ==========================================
// CREAR NEGOCIO COMPLETO
// ==========================================

const newBusinessForm =
  $("newBusinessForm");

if (newBusinessForm) {

  newBusinessForm.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const message =
        $("newBusinessMessage");

      const button =
        $("createBusinessButton");


      message.textContent =
        "Creando negocio...";

      button.disabled = true;


      try {

        // -----------------------------
        // DATOS DEL NEGOCIO
        // -----------------------------

        const name =
          $("newBusinessName")
            .value.trim();

        const slug =
          $("newBusinessSlug")
            .value.trim()
            .toLowerCase();


        const programName =
          $("newProgramName")
            .value.trim()
          || "Tarjeta de Lealtad";


        const primaryColor =
          $("newPrimaryColor")
            .value;


        const backgroundColor =
          $("newBackgroundColor")
            .value;


        const progressEmoji =
          $("newProgressEmoji")
            .value.trim()
          || "★";


        const emptyEmoji =
          $("newEmptyEmoji")
            .value.trim()
          || "☆";


        const progressGoal =
          Number(
            $("newProgressGoal").value
          );


        const welcomeText =
          $("newWelcomeText")
            .value.trim();


        // -----------------------------
        // 1. CREAR NEGOCIO
        // -----------------------------

        const {
          data: businessId,
          error: businessError
        } =
          await db.rpc(
            "admin_create_business",
            {
              new_name: name,
              new_slug: slug
            }
          );


        if (businessError) {

          throw businessError;

        }


        // -----------------------------
        // 2. SUBIR LOGOTIPO
        // -----------------------------

        let logoPath = null;

        const logoFile =
          $("newBusinessLogo")
            .files?.[0];


        if (logoFile) {

          const extension =
            logoFile.name
              .split(".")
              .pop()
              .toLowerCase();


          logoPath =
            `${businessId}/logo.${extension}`;


          const {
            error: uploadError
          } =
            await db.storage
              .from("business-assets")
              .upload(
                logoPath,
                logoFile,
                {
                  upsert: true
                }
              );


          if (uploadError) {

            throw uploadError;

          }

        }


        // -----------------------------
        // 3. GUARDAR BRANDING
        // -----------------------------

        const {
          error: brandingError
        } =
          await db
            .from("business_branding")
            .insert({

              business_id:
                businessId,

              program_name:
                programName,

              logo_path:
                logoPath,

              primary_color:
                primaryColor,

              background_color:
                backgroundColor,

              progress_emoji:
                progressEmoji,

              empty_emoji:
                emptyEmoji,

              progress_goal:
                progressGoal,

              welcome_text:
                welcomeText

            });


        if (brandingError) {

          throw brandingError;

        }


        // -----------------------------
        // ÉXITO
        // -----------------------------

        message.textContent =
          "✓ Negocio creado correctamente";


        setTimeout(
          async () => {

            closeNewBusinessModal();

            newBusinessForm.reset();

            $("newPrimaryColor").value =
              "#E1B85D";

            $("newBackgroundColor").value =
              "#0D0D0E";

            $("newProgressEmoji").value =
              "★";

            $("newEmptyEmoji").value =
              "☆";

            $("newProgressGoal").value =
              "10";

            $("newProgramName").value =
              "Tarjeta de Lealtad";

            $("businessPreviewLogo")
              .innerHTML =
              "LOGO";

            updateBusinessPreview();

            await openBusinessAdmin();

          },
          800
        );


      } catch (error) {

        console.error(error);

        message.textContent =
          "Error: " +
          (
            error.message
            || "No se pudo crear el negocio"
          );

      } finally {

        button.disabled =
          false;

      }

    }
  );

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
