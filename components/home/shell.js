// ─── file: workout-ui-shell.js ───
// (`state` now lives in ./state; the boot block moved to HomeApp.jsx.)

import { state } from "./state";
import { renderHome } from "./home";
import { renderMeasurements } from "./measurements";
import { scrollToSelected } from "./utils";

// All trackable muscle groups with display info
const MUSCLE_GROUPS = {
  shoulders:  { label: "Shoulders",   side: "front" },
  chest:      { label: "Chest",       side: "front" },
  biceps:     { label: "Biceps",      side: "front" },
  triceps:    { label: "Triceps",     side: "back"  },
  forearms:   { label: "Forearms",    side: "front" },
  core:       { label: "Core",        side: "front" },
  quads:      { label: "Quads",       side: "front" },
  upper_back: { label: "Upper Back",  side: "back"  },
  lats:       { label: "Lats",        side: "back"  },
  rear_delts: { label: "Rear Delts",  side: "back"  },
  lower_back: { label: "Lower Back",  side: "back"  },
  glutes:     { label: "Glutes",      side: "back"  },
  hamstrings: { label: "Hamstrings",  side: "back"  },
  calves:     { label: "Calves",      side: "back"  },
};
function formatTime(s) { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }

function startWorkout(w) {
  window.location.assign('/session?w=' + encodeURIComponent(w.id));
}

// Render
function render() {
  const app = document.getElementById("app");
  if (state.screen === "home") app.innerHTML = renderHome();
  else if (state.screen === "measurements") app.innerHTML = renderMeasurements();
  requestAnimationFrame(scrollToSelected);
}

export { MUSCLE_GROUPS, formatTime, startWorkout, render };
