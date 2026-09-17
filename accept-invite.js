const db = supabase.createClient(
  "https://aitupbowuekcfdqsksny.supabase.co",
  "sb_publishable_BuJU2ZgKkAcF39JpL_SaaA_oTmHfW9Z"
);

const $ =
  id => document.getElementById(id);


function hideAll() {

  $("loading").hidden = true;
  $("passwordSection").hidden = true;
  $("successSection").hidden = true;
  $("errorSection").hidden = true;

}


function showError(message) {

  hideAll();

  $("errorMessage").textContent =
    message;

  $("errorSection").hidden =
    false;

}


async function start() {

  // Supabase procesa automáticamente
  // la sesión recibida desde el enlace.

  const {
    data: { session },
    error
  } =
    await db.auth.getSession();


  if (error) {

    showError(
      "No se pudo verificar la invitación."
    );

    return;

  }


  if (!session) {

    // En algunos navegadores Supabase
    // necesita unos instantes para procesar
    // el enlace.

    await new Promise(
      resolve =>
        setTimeout(resolve, 1200)
    );


    const {
      data: { session: retrySession }
    } =
      await db.auth.getSession();


    if (!retrySession) {

      showError(
        "La invitación no es válida, venció o ya fue utilizada."
      );

      return;

    }

  }


  hideAll();

  $("passwordSection").hidden =
    false;

}


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
      "Activando cuenta...";


    const {
      error
    } =
      await db.auth.updateUser({
        password
      });


    if (error) {

      $("message").textContent =
        "No se pudo crear la contraseña: " +
        error.message;

      return;

    }


    hideAll();

    $("successSection").hidden =
      false;

  };


$("goToLogin").onclick =
  async () => {

    await db.auth.signOut();

    window.location.href =
      "index.html";

  };


start();
