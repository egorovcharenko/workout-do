// ─── file: workout-ui-persistence.js ───
// Home-page data loading for Workout Tracker. (The classic in-page logging
// view and its auto-save were removed — live sessions run on
// workout-session.html, which persists through workout-session-persistence.js.)

import { api } from "@/lib/db/api";
import { LEGACY_WORKOUT_NAMES } from "@/lib/legacy/shared";
import { state } from "./state";
import { render } from "./shell";

async function loadHomeData() {
  try {
    const [histRes, activeRes, measRes, settingsRes, hintsRes] = await Promise.all([
      api.history(100),
      api.activeSessions(),
      api.measurements(),
      api.settings(),
      api.hints()
    ]);
    state.history = histRes;
    // Old sessions keep their pre-rename workout_name in the DB; normalize so
    // grouping, rotation, and per-workout trends treat them as the same workout.
    if (Array.isArray(state.history)) state.history.forEach(s => {
      if (LEGACY_WORKOUT_NAMES[s.workout_name]) s.workout_name = LEGACY_WORKOUT_NAMES[s.workout_name];
    });
    try {
      window.USER_SETTINGS = settingsRes;
      if (window.USER_SETTINGS && window.USER_SETTINGS.bodyweight) {
        state.bodyweight = parseInt(window.USER_SETTINGS.bodyweight) || 175;
      }
    } catch (_) {}
    // Last-known weight/reps per exercise, shown on the workout cards.
    try { state.lastSession = hintsRes || {}; }
    catch (_) { state.lastSession = {}; }
    state._activeSessions = activeRes;
    if (state._activeSessions && window.setSessionStateCache) {
      state._activeSessions.forEach(sess => {
        if (sess.state_json) {
          try {
            window.setSessionStateCache(sess.workout_name, sess.date, JSON.parse(sess.state_json));
          } catch (e) {
            console.error("[HOME] failed to parse active session state_json:", e);
          }
        }
      });
    }
    try { state.measurements = measRes; }
    catch (e) { state.measurements = []; }
    state.loaded = true;
    render();
  } catch (e) {
    console.error("[HOME] Error:", e);
    // Fall back to the default render rather than shimmering forever.
    state.loaded = true;
    render();
  }
}

export { loadHomeData };
