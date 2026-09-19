const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
test('Owner sections toggle independently, remember each business, and Staff remains expanded', () => {
  const bodies = {};
  const buttons = ['staffBody', 'customers', 'rewards'].map(section => ({
    dataset: { section }, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(k, fn) { this[k] = fn; },
  }));
  const ctx = vm.createContext({ window: {}, document: { querySelectorAll: () => buttons },
    $: id => bodies[id] ||= {}, currentIsSuperAdmin: false, currentBusinessRole: 'owner', businessId: 'A' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dashboard-sections.js'), 'utf8'), ctx);
  buttons[1].click();
  assert.equal(bodies.customers.hidden, true);
  assert.equal(bodies.rewards.hidden, false);
  ctx.businessId = 'B'; ctx.window.dashboardSections.sync();
  assert.equal(bodies.customers.hidden, false);
  ctx.businessId = 'A'; ctx.window.dashboardSections.sync();
  assert.equal(bodies.customers.hidden, true);
  ctx.currentBusinessRole = 'staff'; ctx.window.dashboardSections.sync();
  buttons[1].click();
  assert.equal(bodies.customers.hidden, false);
  assert.equal(buttons[1].disabled, true);
  ctx.currentIsSuperAdmin = true; ctx.window.dashboardSections.sync();
  assert.equal(buttons[1].disabled, false);
});
