// Load the schedule override only after the exported React/Vinext page has hydrated.
// Retry with cache-busted module URLs if hydration or reconciliation removes the injected view.
const importSchedule = (attempt) =>
  import(`./schedule-override.js?v=20260908-3-${attempt}`).catch((error) => {
    console.error("[guagua] schedule override failed to load", error);
  });

const ensureSchedule = (attempt) => {
  const root = document.getElementById("guagua-schedule-override");
  if (!root) importSchedule(attempt);
};

const loadSchedule = () => {
  window.setTimeout(() => ensureSchedule(1), 1200);
  window.setTimeout(() => ensureSchedule(2), 3500);
  window.setTimeout(() => ensureSchedule(3), 7000);
};

if (document.readyState === "complete") {
  loadSchedule();
} else {
  window.addEventListener("load", loadSchedule, { once: true });
}
