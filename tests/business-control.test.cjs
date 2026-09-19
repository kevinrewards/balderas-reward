const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../business-control.js"), "utf8");

function setup() {
  const elements = {};
  const calls = [];
  const rows = {
    members: [
      { user_id: "o1", role: "owner", full_name: "<Owner>", active: true },
      { user_id: "s1", role: "staff", full_name: "Staff", active: false }
    ],
    customers: [{ id: "c1", name: "<Cliente>", active: true }],
    rewards: [{ id: "r1", name: "Premio", active: true, required_visits: 5 }],
    business_branding: { program_name: "Programa", progress_goal: 10 }
  };
  const element = id => elements[id] ||= {
    hidden: false, disabled: false, innerHTML: "", textContent: "", attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(k, fn) { this[k] = fn; },
    querySelectorAll() { return []; }
  };
  const context = vm.createContext({
    $: element, selectedBusinessManage: { businessId: "B", businessName: "Negocio B" },
    currentIsSuperAdmin: true, businessId: "A", confirm: () => true,
    escapeHtml: value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    loadBusinessStaff: async () => calls.push(["refresh"]),
    db: {
      rpc: async (name, args) => {
        calls.push([name, args]);
        return { data: name === "is_platform_admin" ? true : name === "list_business_members" ? rows.members : null };
      },
      from: table => {
        calls.push(["from", table]);
        const query = {
          select() { return query; },
          eq(key, value) { calls.push(["eq", key, value]); return query; },
          order: async () => ({ data: rows[table] }),
          maybeSingle: async () => ({ data: rows[table] })
        };
        return query;
      }
    }
  });
  vm.runInContext(source + "\nthis.control = businessControl;", context);
  return { context, elements, calls, rows };
}

test("Owners and Staff are separated and scoped to selected business", async () => {
  const { context: c, elements: e, calls } = setup();
  await c.control.open();
  assert.match(e.businessControlPanel.innerHTML, /&lt;Owner&gt;/);
  assert.doesNotMatch(e.businessControlPanel.innerHTML, />Staff</);
  assert.equal(calls.find(call => call[0] === "list_business_members")[1].target_business_id, "B");
  await e.businessManageStaff.onclick();
  assert.match(e.businessControlPanel.innerHTML, /Staff/);
  assert.doesNotMatch(e.businessControlPanel.innerHTML, /&lt;Owner&gt;/);
});

test("all read-only sections filter by selected business", async () => {
  const { context: c, elements: e, calls } = setup();
  await c.control.open();
  for (const id of ["businessManageCustomers", "businessManageRewards", "businessManageBranding"]) {
    await e[id].onclick();
    assert.ok(e.businessControlPanel.innerHTML.length > 0);
  }
  assert.equal(calls.filter(call => call[0] === "eq" && call[1] === "business_id" && call[2] === "B").length, 3);
});

test("server denial prevents reads and shows retry", async () => {
  const { context: c, elements: e, calls } = setup();
  c.db.rpc = async () => ({ data: false });
  await c.control.open();
  assert.equal(calls.length, 0);
  assert.match(e.businessControlPanel.innerHTML, /Reintentar/);
  assert.match(e.businessManageMessage.textContent, /Superadmin/);
});

test("late response cannot replace a newer section", async () => {
  const { context: c, elements: e } = setup();
  let resolve;
  c.db.rpc = async name => name === "is_platform_admin" ? { data: true } :
    new Promise(done => { resolve = done; });
  const pending = c.control.open();
  await new Promise(done => setImmediate(done));
  await e.businessManageCustomers.onclick();
  resolve({ data: [{ role: "owner", full_name: "Stale owner" }] });
  await pending;
  assert.match(e.businessControlPanel.innerHTML, /Cliente/);
  assert.doesNotMatch(e.businessControlPanel.innerHTML, /Stale/);
});

test("Staff mutation uses selected B, never dashboard A; double click ignored", async () => {
  const { context: c, elements: e, calls } = setup();
  await c.control.open();
  await e.businessManageStaff.onclick();
  const button = { dataset: { controlMember: "0", controlAction: "deactivate" } };
  const event = { target: { closest: selector => selector === "[data-control-member]" ? button : null } };
  const first = e.businessControlPanel.click(event);
  const second = e.businessControlPanel.click(event);
  await Promise.all([first, second]);
  const writes = calls.filter(call => call[0] === "manage_business_member");
  assert.equal(writes.length, 1);
  assert.equal(writes[0][1].target_business_id, "B");
  assert.equal(writes[0][1].target_user_id, "s1");
  assert.equal(e.closeBusinessManage.disabled, false);
  assert.match(e.businessManageMessage.textContent, /guardado/);
});

test("Owner removal uses lifecycle flow for the selected business", async () => {
  const { context: c, elements: e, calls } = setup();
  c.window = { adminLifecycle: { run: async (...args) => { calls.push(["lifecycle", ...args]); return true; } } };
  await c.control.open();
  const button = { dataset: { controlMember: "0", controlAction: "remove" } };
  await e.businessControlPanel.click({ target: { closest: selector => selector === "[data-control-member]" ? button : null } });
  const call = calls.find(call => call[0] === "lifecycle");
  assert.equal(call[1], "remove_owner");
  assert.equal(call[2].businessId, "B");
  assert.equal(call[3], "o1");
  assert.ok(!calls.some(call => call[0] === "manage_business_member"));
});

test("close invalidates in-flight data", async () => {
  const { context: c, elements: e } = setup();
  let resolve;
  c.db.rpc = async name => name === "is_platform_admin" ? { data: true } :
    new Promise(done => { resolve = done; });
  const pending = c.control.open();
  await new Promise(done => setImmediate(done));
  c.control.close();
  resolve({ data: [{ role: "owner", full_name: "Stale" }] });
  await pending;
  assert.equal(e.businessControlPanel.innerHTML, "");
});
