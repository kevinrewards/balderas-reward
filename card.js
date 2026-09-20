const db = supabase.createClient(
  "https://aitupbowuekcfdqsksny.supabase.co",
  "sb_publishable_BuJU2ZgKkAcF39JpL_SaaA_oTmHfW9Z"
);

const $ = id => document.getElementById(id);
let currentProgressDesign = {};

function makeStars(completed, total) {

  return window.LoyaltyProgress.render(completed, total, currentProgressDesign);
}

function escapeHTML(value) {

  return String(value ?? "")
    .replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));

}

async function loadCard() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const token =
    params.get("token");

  if (!token) {
    showError();
    return;
  }

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

    console.error(error);
    showError();
    return;

  }

  const first = data[0];
  currentProgressDesign = await window.LoyaltyProgress.forToken(db, token);

  const available =
    Number(first.available_visits || 0);

  $("businessName").textContent =
    first.business_name;

  $("customerName").textContent =
    first.customer_name;

  const maximum =
    Math.max(
      ...data.map(
        reward =>
          Number(reward.required_visits || 0)
      ),
      10
    );

  const mainProgress =
    Math.min(available, maximum);

  $("mainStars").textContent =
    makeStars(
      mainProgress,
      maximum
    );

  $("mainCounter").textContent =
    available + " / " + maximum;

  $("rewardList").innerHTML =
    data
      .filter(
        reward =>
          reward.reward_id !== null
      )
      .map(reward => {

        const required =
          Number(
            reward.required_visits
          );

        const completed =
          Math.min(
            available,
            required
          );

        const unlocked =
          available >= required;

        return `
          <article class="reward ${unlocked ? "unlocked" : ""}">

            <div class="rewardName">
              🎁 ${escapeHTML(
                reward.reward_name
              )}
            </div>

            ${
              reward.reward_description
                ? `
                  <div class="rewardDescription">
                    ${escapeHTML(
                      reward.reward_description
                    )}
                  </div>
                `
                : ""
            }

            <div class="rewardStars">
              ${escapeHTML(makeStars(
                completed,
                required
              ))}
            </div>

            <div class="rewardCounter">
              ${completed}/${required}
            </div>

            ${
              unlocked
                ? `
                  <div class="rewardAvailable">
                    ✓ RECOMPENSA DISPONIBLE
                  </div>
                `
                : ""
            }

          </article>
        `;

      })
      .join("");
/* QR PERSONAL DEL CLIENTE */

  // Show the card regardless of optional QR rendering failures.
  $("loading").hidden = true;
  $("loyaltyCard").hidden = false;
  // Optional V2 enhancements must never block the usable card or its QR.
  window.cardExperience?.init().catch(() => {});

  try {
    const checkinURL = window.LoyaltyLinks.build("checkin.html", token, { portable: true });
    $("checkinLink").href = checkinURL;
    $("checkinLink").hidden = false;
    $("customerQR").innerHTML = "";
    new QRCode($("customerQR"), {
      text: checkinURL,
      width: 190,
      height: 190,
      correctLevel: QRCode.CorrectLevel.H
    });
    if (window.location.protocol === "file:") {
      $("qrMessage").textContent = "Vista previa local: el QR y el enlace abren la versión publicada.";
      $("qrMessage").hidden = false;
    }
  } catch {
    $("customerQR").innerHTML = "";
    $("qrMessage").textContent = "No se pudo generar el QR. Usa el enlace de registro o recarga la tarjeta.";
    $("qrMessage").hidden = false;
  }

}

function showError(message) {

  $("loading").hidden = true;
  $("loyaltyCard").hidden = true;
  if (message) $("error").textContent = message;
  $("error").hidden = false;

}

loadCard().catch(() => {
  showError("No pudimos cargar la tarjeta. Revisa tu conexión y recarga la página.");
});
