const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const c = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../progress-design.js"), "utf8"), c);
const progress = c.window.LoyaltyProgress;
test("default design remains stars", () => assert.equal(progress.render(3, 5), "★★★☆☆"));
test("camera, seasonal and multi-codepoint symbols render as whole strings", () => {
  for (const symbol of ["📷", "🎄", "🎃", "❤️", "👨‍👩‍👧‍👦"]) {
    assert.equal(progress.render(2, 3, { progress_emoji: symbol, empty_emoji: "○" }), symbol + symbol + "○");
  }
});
test("invalid saved symbols and huge counts cannot cause unbounded rendering", () => {
  assert.equal(progress.render(-1, 3, { empty_emoji: "" }), "☆☆☆");
  assert.equal(progress.render(10000, 10000, { progress_emoji: "x".repeat(100) }).length, 100);
});
test("public design fetch is token scoped, with fallback for unavailable RPC", async () => {
  const value = await progress.forToken({ rpc: async (name, args) => {
    assert.equal(name, "get_loyalty_card_design");
    assert.equal(args.card_token, "token");
    return { data: [{ progress_emoji: "📷", empty_emoji: "○" }] };
  } }, "token");
  assert.equal(value.progress_emoji, "📷");
  const fallback = await progress.forToken({ rpc: async () => ({ error: new Error("Missing RPC") }) }, "token");
  assert.equal(fallback.progress_emoji, "★");
});
