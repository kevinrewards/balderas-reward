/* Independent sections; Staff keeps its existing expanded view. */
window.dashboardSections = (() => {
  const states = new Map();
  const buttons = [...document.querySelectorAll("[data-section]")];
  function sync() {
    const canCollapse = currentIsSuperAdmin || currentBusinessRole === "owner";
    for (const button of buttons) {
      const key = businessId + ":" + button.dataset.section;
      const open = !canCollapse || states.get(key) !== false;
      button.disabled = !canCollapse;
      button.setAttribute("aria-controls", button.dataset.section);
      button.setAttribute("aria-expanded", String(open));
      $(button.dataset.section).hidden = !open;
    }
  }
  for (const button of buttons) button.addEventListener("click", () => {
    if (!currentIsSuperAdmin && currentBusinessRole !== "owner") return;
    states.set(businessId + ":" + button.dataset.section, button.getAttribute("aria-expanded") !== "true");
    sync();
  });
  sync();
  return { sync };
})();
