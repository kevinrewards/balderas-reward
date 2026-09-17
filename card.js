const db = supabase.createClient(
  "https://aitupbowuekcfdqsksny.supabase.co",
  "sb_publishable_BuJU2ZgKkAcF39JpL_SaaA_oTmHfW9Z"
);

const $ = id => document.getElementById(id);

function makeStars(completed, total) {

  completed = Math.min(
    Math.max(completed, 0),
    total
  );

  return Array.from(
    { length: total },
    (_, i) => i < completed ? "★" : "☆"
  ).join("");
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

const checkinURL =
  new URL(
    "checkin.html",
    window.location.href
  );

checkinURL.searchParams.set(
  "token",
  token
);

$("customerQR").innerHTML = "";

new QRCode(
  $("customerQR"),
  {
    text: checkinURL.href,
    width: 190,
    height: 190,
    correctLevel:
      QRCode.CorrectLevel.H
  }
);
  $("loading").hidden = true;
  $("loyaltyCard").hidden = false;

}

function showError() {

  $("loading").hidden = true;
  $("error").hidden = false;

}

loadCard();
