// ─── file: workout-ui-utils.js ───
// UI Utilities for Workout Tracker (home page)

import { api } from "@/lib/db/api";
import { state } from "./state";
import { render } from "./shell";

async function showMeasurements() {
  state.screen = "measurements";
  history.replaceState(null, '', '#measurements');
  render();
  if (!state.measurements) {
    try {
      state.measurements = await api.measurements();
    } catch (e) {
      console.warn('[MEASUREMENTS] load failed:', e);
      state.measurements = [];
    }
    render();
  }
}

function scrollToSelected() {
  document.querySelectorAll('.scroll-row').forEach(row => {
    const target = row.querySelector('[data-scroll-target]');
    if (!target || row.scrollWidth <= row.clientWidth) return;
    const rowRect = row.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetCenterInRow = (targetRect.left - rowRect.left) + row.scrollLeft + targetRect.width / 2;
    row.scrollLeft = Math.max(0, targetCenterInRow - rowRect.width / 2);
  });
}

export { showMeasurements, scrollToSelected };
