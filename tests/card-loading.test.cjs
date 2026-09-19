const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const source = file => fs.readFileSync(path.join(__dirname, "../", file), "utf8");
const token = "00000000-0000-4000-8000-000000000001";
const local = "file:///C:/Users/Example/Downloads/" + "folder%20".repeat(45) + "/card.html?token=" + token;

function setup({ href = local, qrFails = false, queryFails = false } = {}) {
  const elements = {};
  const node = id => elements[id] ||= { hidden: true, textContent: "", innerHTML: "" };
  node("loading").hidden = false;
  let qrURL;
  function QRCode(_, options) {
    qrURL = options.text;
    if (qrFails) throw Error("code length overflow");
  }
  QRCode.CorrectLevel = { H: 2 };
  const db = {
    rpc: async name => {
      if (queryFails) throw Error("Network failure");
      return { data: name === "get_loyalty_card_design"
        ? [{ progress_emoji: "📷", empty_emoji: "○" }]
        : [{ customer_name: "Cliente de prueba", business_name: "Negocio",
             available_visits: 3, reward_id: null }] };
    }
  };
  const c = vm.createContext({
    URL, URLSearchParams, console, QRCode,
    window: { location: new URL(href) },
    document: { getElementById: node },
    supabase: { createClient: () => db }
  });
  vm.runInContext(source("progress-design.js"), c);
  vm.runInContext(source("card-links.js"), c);
  return { c, elements, qrURL: () => qrURL };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("long Windows path uses a short HTTPS QR and renders the card", async () => {
  const { c, elements, qrURL } = setup();
  vm.runInContext(source("card.js"), c);
  await settle();
  assert.equal(qrURL(), "https://kevinrewards.github.io/balderas-reward/checkin.html?token=" + token);
  assert.ok(qrURL().length < 150);
  assert.equal(elements.loading.hidden, true);
  assert.equal(elements.loyaltyCard.hidden, false);
  assert.match(elements.mainStars.textContent, /📷📷📷/);
  assert.match(elements.qrMessage.textContent, /versión publicada/);
});
test("QR overflow no longer hides the card", async () => {
  const { c, elements } = setup({ qrFails: true });
  vm.runInContext(source("card.js"), c);
  await settle();
  assert.equal(elements.loading.hidden, true);
  assert.equal(elements.loyaltyCard.hidden, false);
  assert.equal(elements.checkinLink.hidden, false);
  assert.match(elements.qrMessage.textContent, /No se pudo generar/);
});
test("RPC rejection exits loading with a visible error", async () => {
  const { c, elements } = setup({ queryFails: true });
  vm.runInContext(source("card.js"), c);
  await settle();
  assert.equal(elements.loading.hidden, true);
  assert.equal(elements.error.hidden, false);
});
test("published pages retain their own HTTPS path and encoded token", () => {
  const { c } = setup();
  const url = c.window.LoyaltyLinks.build("checkin.html", "a&b", {
    portable: true, href: "https://example.test/program/card.html?token=old"
  });
  assert.equal(url, "https://example.test/program/checkin.html?token=a%26b");
});
test("local Open card remains local while Share card is portable", () => {
  const { c } = setup();
  assert.ok(c.window.LoyaltyLinks.build("card.html", token).startsWith("file:///"));
  assert.ok(c.window.LoyaltyLinks.build("card.html", token, { portable: true }).startsWith("https://"));
});
