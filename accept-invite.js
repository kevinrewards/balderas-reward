const db = supabase.createClient(
  "https://aitupbowuekcfdqsksny.supabase.co",
  "sb_publishable_BuJU2ZgKkAcF39JpL_SaaA_oTmHfW9Z"
);

const $ = id =>
  document.getElementById(id);

let recoveryReady = false;


function hideAll() {

  $("loading").hidden = true;
  $("passwordSection").hidden = true;
  $("successSection").hidden = true;
  $("errorSection").hidden = true;

}


function showPasswordForm() {

  recoveryReady = true;

  hideAll();

  $("passwordSection").hidden =
    false;

}


function showError(message) {

  recoveryReady = false;

  hideAll();

  $("errorMessage").textContent =
    message;

  $("errorSection").hidden =
    false;

}


// ==========================================
// ESCUCHAR INVITACIÓN / RECUPERACIÓN
// ==========================================

db.auth.onAuthStateChange(
  async (event, session) => {

    console.log(
      "BALDERAS Auth event:",
      event
    );


    if (
      event === "PASSWORD_RECOVERY"
    ) {

      showPasswordForm();

      return;

    }


    if (
      event === "SIGNED_IN" &&
      session
    ) {

      showPasswordForm();

      return;

    }

  }
);


// ==========================================
// INICIAR
// ==========================================

async function start() {

  $("loading").hidden = false;


  // Dar tiempo a Supabase para procesar
  // el token/code de la URL.
  await new Promise(
    resolve =>
      setTimeout(resolve, 1000)
  );


  const {
    data: { session },
    error
  } =
    await db.auth.getSession();


  if (error) {

    showError(
      "No se pudo verificar el enlace."
    );

    return;

  }


  if (session) {

    showPasswordForm();

    return;

  }


  // Esperamos un poco más por si el
  // evento PASSWORD_RECOVERY está entrando.
  await new Promise(
    resolve =>
      setTimeout(resolve, 1500)
  );


  if (!recoveryReady) {

    showError(
      "Este enlace venció, ya fue utilizado o no es válido."
    );

  }

}


// ==========================================
// GUARDAR NUEVA CONTRASEÑA
// ==========================================

$("passwordForm").onsubmit =
  async event => {

    event.preventDefault();


    const password =
      $("newPassword").value;

    const confirmation =
      $("confirmPassword").value;


    if (password.length < 8) {

      $("message").textContent =
        "La contraseña debe tener al menos 8 caracteres.";

      return;

    }


    if (password !== confirmation) {

      $("message").textContent =
        "Las contraseñas no coinciden.";

      return;

    }


    $("message").textContent =
      "Guardando nueva contraseña...";


    const {
      data,
      error
    } =
      await db.auth.updateUser({
        password:
          password
      });


    if (error) {

      console.error(
        "Error updateUser:",
        error
      );

      $("message").textContent =
        "No se pudo guardar la contraseña: " +
        error.message;

      return;

    }


    if (!data?.user) {

      $("message").textContent =
        "No se pudo confirmar el cambio de contraseña.";

      return;

    }


    hideAll();

    $("successSection").hidden =
      false;

};


// ==========================================
// IR AL LOGIN
// ==========================================

$("goToLogin").onclick =
  async () => {

    await db.auth.signOut();

    window.location.href =
      "index.html";

  };


start();
