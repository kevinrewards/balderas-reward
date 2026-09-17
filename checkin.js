const db = supabase.createClient(
  "https://aitupbowuekcfdqsksny.supabase.co",
  "sb_publishable_BuJU2ZgKkAcF39JpL_SaaA_oTmHfW9Z"
);

const $ = id =>
  document.getElementById(id);

const params =
  new URLSearchParams(
    window.location.search
  );

const token =
  params.get("token");

let customer = null;


/* ESTRELLAS */

function makeStars(
  completed,
  total = 10
) {

  completed =
    Math.min(
      Math.max(completed, 0),
      total
    );

  return Array.from(
    { length: total },
    (_, i) =>
      i < completed ? "★" : "☆"
  ).join("");

}


/* OCULTAR PANTALLAS */

function hideSections() {

  $("loading").hidden = true;
  $("loginSection").hidden = true;
  $("customerSection").hidden = true;
  $("successSection").hidden = true;
  $("errorSection").hidden = true;

}


/* ERROR */

function showError(message) {

  hideSections();

  $("errorMessage").textContent =
    message;

  $("errorSection").hidden = false;

}


/* COMPROBAR SESIÓN */

async function start() {

  if (!token) {

    showError(
      "Este código de cliente no es válido."
    );

    return;
  }

  const {
    data: { session }
  } =
    await db.auth.getSession();

  if (!session) {

    hideSections();

    $("loginSection").hidden = false;

    return;
  }

  await loadCustomer();

}


/* LOGIN */

$("loginForm").onsubmit =
  async event => {

    event.preventDefault();

    $("loginMessage").textContent =
      "Verificando...";

    const { error } =
      await db.auth.signInWithPassword({

        email:
          $("email").value.trim(),

        password:
          $("password").value

      });

    if (error) {

      $("loginMessage").textContent =
        "No se pudo iniciar sesión.";

      return;
    }

    $("loginMessage").textContent = "";

    await loadCustomer();

  };


/* BUSCAR CLIENTE */

async function loadCustomer() {

  hideSections();

  $("loading").hidden = false;

  const { data, error } =
    await db.rpc(
      "get_loyalty_card",
      {
        card_token: token
      }
    );

  if (
    error ||
    !data ||
    data.length === 0
  ) {

    showError(
      "No encontramos este cliente."
    );

    return;
  }

  const first =
    data[0];

  /*
    COMPROBAR QUE EL USUARIO
    PERTENECE AL NEGOCIO
  */

  const { data: memberships,
          error: membershipError } =
    await db
      .from("business_members")
      .select(`
        business_id,
        businesses (
          name
        )
      `);

  if (
    membershipError ||
    !memberships ||
    memberships.length === 0
  ) {

    showError(
      "Tu cuenta no tiene acceso a este negocio."
    );

    return;
  }

  const membership =
    memberships.find(
      item =>
        item.businesses &&
        item.businesses.name ===
          first.business_name
    );

  if (!membership) {

    showError(
      "Este cliente pertenece a otro negocio."
    );

    return;
  }

  customer = {
    name:
      first.customer_name,

    available:
      Number(
        first.available_visits || 0
      )
  };

  $("businessName").textContent =
    first.business_name;

  $("customerName").textContent =
    customer.name;

  const progress =
    Math.min(
      customer.available,
      10
    );

  $("stars").textContent =
    makeStars(progress, 10);

  $("visitCounter").textContent =
    customer.available + " / 10";

  hideSections();

  $("customerSection").hidden =
    false;

}


/* CONFIRMAR VISITA */

$("confirmVisit").onclick =
  async () => {

    if (!customer) return;

    const confirmation =
      confirm(
        "¿Confirmar una visita para " +
        customer.name +
        "?"
      );

    if (!confirmation) return;

    $("confirmVisit").disabled =
      true;

    $("confirmVisit").textContent =
      "Registrando...";

    /*
      NECESITAMOS OBTENER EL ID
      DEL CLIENTE DE FORMA SEGURA.
      SE RESUELVE CON LA FUNCIÓN
      SQL DEL SIGUIENTE PASO.
    */

    const { data, error } =
      await db.rpc(
        "register_visit_by_token",
        {
          card_token: token
        }
      );

    if (error) {

      $("confirmVisit").disabled =
        false;

      $("confirmVisit").textContent =
        "✓ CONFIRMAR VISITA";

      alert(
        "No se pudo registrar la visita: " +
        error.message
      );

      return;
    }

    customer.available += 1;

    $("successName").textContent =
      customer.name;

    const progress =
      Math.min(
        customer.available,
        10
      );

    $("successStars").textContent =
      makeStars(
        progress,
        10
      );

    $("successCounter").textContent =
      customer.available + " / 10";

    hideSections();

    $("successSection").hidden =
      false;

  };


/* FINALIZAR */

$("finishButton").onclick = () => {

  window.location.href =
    "index.html";

};


start();
