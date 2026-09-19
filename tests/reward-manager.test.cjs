const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const code = fs.readFileSync(path.join(__dirname, "../reward-manager.js"), "utf8");

function setup() {
  const elements = {};
  const writes = [];
  const permissions = { A: true, B: false };
  const $ = id => elements[id] ||= {
    hidden: false, open: false, value: "", checked: false, textContent: "", innerHTML: "",
    showModal() { this.open = true; }, close() { this.open = false; },
    querySelectorAll() { return []; }, addEventListener(name, fn) { this[name] = fn; }, focus() {}
  };
  $("app").hidden = true;
  const c = vm.createContext({
    $, window: {}, businessId: "A", load: async () => {},
    escapeHtml: value => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    db: {
      rpc: async (_, args) => ({ data: permissions[args.target_business_id] === true }),
      from: table => {
        let write;
        const query = {
          select() { return query; },
          update(payload) { write = { table, payload, filters: [] }; writes.push(write); return query; },
          insert(payload) { write = { table, payload, filters: [] }; writes.push(write); return query; },
          eq(key, value) { if (write) write.filters.push([key, value]); return query; },
          single: async () => ({ data: { id: "r1" } }),
          order: async () => ({ data: [] })
        };
        return query;
      }
    }
  });
  vm.runInContext(code, c);
  return { c, elements, writes, permissions };
}
const valid = { name: "Premio", description: "Detalle", required_visits: 5, active: true };

test("Staff cannot write even when invoking the save path directly", async () => {
  const { c, writes, permissions } = setup();
  permissions.A = false;
  await assert.rejects(c.persistReward("A", null, valid), /Owner activo/);
  assert.equal(writes.length, 0);
});
test("Owner may write in A, not B", async () => {
  const { c, writes } = setup();
  await c.persistReward("A", null, valid);
  await assert.rejects(c.persistReward("B", null, valid));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.business_id, "A");
});
test("Superadmin can target B independently of dashboard A", async () => {
  const { c, permissions, writes } = setup();
  permissions.B = true;
  await c.persistReward("B", "reward-B", valid);
  assert.deepEqual(Array.from(writes[0].filters, pair => Array.from(pair)), [["id", "reward-B"], ["business_id", "B"]]);
  assert.equal(writes[0].payload.business_id, undefined);
});
test("invalid visit counts never issue a write", async () => {
  const { c, writes } = setup();
  for (const count of [0, -1, 1.5, 101, "NaN", ""]) {
    await assert.rejects(c.persistReward("A", null, { ...valid, required_visits: count }));
  }
  assert.equal(writes.length, 0);
});
test("revoked permissions are checked again on save", async () => {
  const { c, writes, permissions } = setup();
  await c.window.rewardManager.open("A", "Negocio A");
  permissions.A = false;
  await assert.rejects(c.persistReward("A", "r1", valid));
  assert.equal(writes.length, 0);
});
test("zero-row write is not reported as saved", async () => {
  const { c } = setup();
  c.db.from = () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null }) }) }) });
  await assert.rejects(c.persistReward("A", null, valid), /No se confirmó/);
});
test("closed or replaced editor cannot submit after permission request resolves", async () => {
  const { c, writes } = setup();
  await assert.rejects(c.persistReward("A", null, valid, () => false), /seleccionado cambió/);
  assert.equal(writes.length, 0);
});
test("Staff button stays hidden and direct editor opening fails closed", async () => {
  const { c, elements, permissions } = setup();
  permissions.A = false;
  elements.app.hidden = false;
  await c.window.rewardManager.syncPermission();
  assert.equal(elements.editBusinessRewards.hidden, true);
  await c.window.rewardManager.open("A", "Negocio A");
  assert.equal(elements.newManagedReward.hidden, true);
  assert.match(elements.rewardManagerMessage.textContent, /Owner activo/);
});
test("duplicate form submissions save only once", async () => {
  const { c, elements, writes } = setup();
  await c.window.rewardManager.open("A", "Negocio A");
  elements.newManagedReward.onclick();
  elements.managedRewardName.value = "Premio";
  const event = { preventDefault() {} };
  await Promise.all([elements.rewardEditorForm.onsubmit(event), elements.rewardEditorForm.onsubmit(event)]);
  assert.equal(writes.length, 1);
  assert.match(elements.rewardManagerMessage.textContent, /guardada/);
});
