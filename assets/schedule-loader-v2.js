// Load the schedule override only after the exported React/Vinext page has hydrated.
// The previous eager import ran before hydration and its DOM changes could be reconciled away.
const loadSchedule = () => {
  window.setTimeout(() => {
    import("./schedule-override.js?v=20260908-2").catch((error) => {
      console.error("[guagua] schedule override failed to load", error);
    });
  }, 1200);
};

if (document.readyState === "complete") {
  loadSchedule();
} else {
  window.addEventListener("load", loadSchedule, { once: true });
}
