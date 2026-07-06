import { api } from "@/lib/db/api";
import { TEST_MODE, localDate } from "./shared";
import { safeJSON } from "./session-utils";

const _sessionStateCache = {}; // Key: "workoutName:date" -> { swaps, skipped, deferred, setsMap }

function setSessionStateCache(workoutName, date, stateObj) {
  if (!stateObj) return;
  _sessionStateCache[`${workoutName}:${date}`] = {
    swaps: stateObj.swaps || {},
    skipped: stateObj.skipped || [],
    deferred: stateObj.deferred || [],
    setsMap: stateObj.setsMap || {},
  };
}

function loadSwaps(workoutName, date) {
  const cached = _sessionStateCache[`${workoutName}:${date}`];
  return (cached && cached.swaps) || {};
}
function saveSwaps(workoutName, date, swapMap) {
  if (!_sessionStateCache[`${workoutName}:${date}`]) {
    _sessionStateCache[`${workoutName}:${date}`] = {};
  }
  _sessionStateCache[`${workoutName}:${date}`].swaps = swapMap;
}

function loadPmStarted(workoutName, date) {
  return false;
}
function savePmStarted(workoutName, date, started) {
  // No-op
}

function loadSkippedExercises(workoutName, date) {
  const cached = _sessionStateCache[`${workoutName}:${date}`];
  return new Set((cached && cached.skipped) || []);
}
function saveSkippedExercises(workoutName, date, namesSet) {
  if (!_sessionStateCache[`${workoutName}:${date}`]) {
    _sessionStateCache[`${workoutName}:${date}`] = {};
  }
  _sessionStateCache[`${workoutName}:${date}`].skipped = Array.from(namesSet);
}

function loadDeferred(workoutName, date) {
  const cached = _sessionStateCache[`${workoutName}:${date}`];
  return (cached && cached.deferred) || [];
}
function saveDeferred(workoutName, date, names) {
  if (!_sessionStateCache[`${workoutName}:${date}`]) {
    _sessionStateCache[`${workoutName}:${date}`] = {};
  }
  _sessionStateCache[`${workoutName}:${date}`].deferred = names;
}
function applyDeferredOrder(exercises, deferredNames) {
  if (!deferredNames || !deferredNames.length) return exercises;
  const deferredSet = new Set(deferredNames);
  const kept = exercises.filter(e => !deferredSet.has(e.name));
  const moved = deferredNames
    .map(name => exercises.find(e => e.name === name))
    .filter(Boolean)
    .map(e => ({ ...e, deferred: true }));
  return [...kept, ...moved];
}

function loadBodyweight() {
  const val = (typeof window !== "undefined" && window.USER_SETTINGS && window.USER_SETTINGS.bodyweight) || null;
  return val ? parseFloat(val) : null;
}
function saveBodyweight(w) {
  if (typeof window !== "undefined") {
    if (!window.USER_SETTINGS) window.USER_SETTINGS = {};
    window.USER_SETTINGS.bodyweight = w;
    if (TEST_MODE) return;
    api.saveSettings({ bodyweight: w }).catch(e => console.error("[SETTINGS] failed to auto-save bodyweight:", e));
  }
}

function loadSessionSets(workoutName, date) {
  const cached = _sessionStateCache[`${workoutName}:${date}`];
  return (cached && cached.setsMap) || {};
}
function saveSessionSets(workoutName, date, exercises) {
  const setsMap = {};
  exercises.forEach(ex => {
    setsMap[ex.name] = ex.sets;
  });
  if (!_sessionStateCache[`${workoutName}:${date}`]) {
    _sessionStateCache[`${workoutName}:${date}`] = {};
  }
  _sessionStateCache[`${workoutName}:${date}`].setsMap = setsMap;
}

function serializeForSave(exercises, workoutName, sessionId, startedAt, elapsed, activeDate) {
  const sets = [];
  exercises.forEach(ex => {
    ex.sets.forEach(s => {
      if (!s.completed) return;
      const isAssist = ex.assist;
      const bands = s.bands || [];
      const bandSum = bands.reduce((a, b) => a + b, 0);
      let weight_lb;
      if (isAssist) {
        weight_lb = Math.max(0, (s.bodyweight || 0) - bandSum);
      } else if (ex.isBandsOnly) {
        weight_lb = bandSum;
      } else if (ex.bandAddon) {
        weight_lb = (s.weight || 0) + bandSum;
      } else {
        weight_lb = s.weight || 0;
      }
      sets.push({
        exercise: s.saveExerciseName,
        set_type: s.kind === "warmup" ? "warmup" : "working",
        set_number: s.setNumber,
        reps: String(s.reps || ""),
        weight_lb,
        bands_json: bands.length ? JSON.stringify(bands) : null,
        grip: s.grip || null,
        logged_at: s.logged_at || null,
      });
    });
  });

  const date = activeDate || localDate();
  const cached = _sessionStateCache[`${workoutName}:${date}`] || {};
  const setsMap = {};
  exercises.forEach(ex => {
    setsMap[ex.name] = ex.sets;
  });
  const stateObj = {
    swaps: cached.swaps || {},
    skipped: cached.skipped || [],
    deferred: cached.deferred || [],
    deload: !!window.SESSION_DELOAD,
    setsMap: setsMap
  };

  return {
    workout: workoutName,
    date: date,
    duration_sec: elapsed,
    session_id: sessionId || null,
    started_at: startedAt ? new Date(startedAt).toISOString() : null,
    is_deload: window.SESSION_DELOAD ? 1 : 0,
    sets,
    state_json: JSON.stringify(stateObj),
  };
}

let _saveInFlight = false;
let _savePending = null;
async function autoSavePayload(payload, onResolved) {
  if (TEST_MODE) return;
  if (_saveInFlight) {
    _savePending = { payload, onResolved };
    return;
  }
  _saveInFlight = true;
  try {
    const res = await api.save(payload);
    if (res.ok) onResolved(res.id);
  } catch (e) {
    console.error("[V2-SAVE] error:", e);
  } finally {
    _saveInFlight = false;
    if (_savePending) {
      const next = _savePending; _savePending = null;
      autoSavePayload(next.payload, next.onResolved);
    }
  }
}

function hydrateToday(exercises, todaySets) {
  const map = new Map();
  exercises.forEach((ex, eIdx) => {
    ex.sets.forEach((s, sIdx) => {
      const key = `${s.saveExerciseName}|${s.kind === "warmup" ? "warmup" : "working"}|${s.setNumber}`;
      map.set(key, { eIdx, sIdx });
    });
  });
  const next = exercises.map(ex => ({
    ...ex,
    sets: ex.sets.map(s => ({ ...s, active: false }))
  }));
  if (todaySets && todaySets.length) {
    todaySets.forEach(row => {
      const key = `${row.exercise}|${row.set_type}|${row.set_number}`;
      const ref = map.get(key);
      if (!ref) return;
      const ex = next[ref.eIdx];
      const set = ex.sets[ref.sIdx];
      set.reps = parseInt(row.reps) || null;
      set.completed = true;
      const bands = row.bands_json ? safeJSON(row.bands_json) : [];
      set.bands = bands;
      const bandSum = bands.reduce((a, b) => a + b, 0);
      const savedLb = row.weight_lb || 0;
      if (ex.assist) {
        set.bodyweight = savedLb + bandSum;
      } else if (ex.bandAddon) {
        set.weight = Math.max(0, savedLb - bandSum);
      } else if (ex.isBandsOnly) {
        set.weight = 0;
      } else {
        set.weight = savedLb;
      }
      if (row.grip) set.grip = row.grip;
    });
  }
  return activateNextSet(next);
}

function activateNextSet(exercises) {
  for (const ex of exercises) {
    for (const s of ex.sets) if (s.active) s.active = false;
  }
  let activated = false;
  for (const ex of exercises) {
    if (activated) break;
    if (ex.skipped) continue;
    let highestCompleted = -1;
    for (let i = 0; i < ex.sets.length; i++) {
      if (ex.sets[i].completed) highestCompleted = i;
    }
    for (let i = highestCompleted + 1; i < ex.sets.length; i++) {
      if (!ex.sets[i].completed && !ex.sets[i].userSkipped) {
        ex.sets[i].active = true;
        activated = true;
        break;
      }
    }
  }
  return exercises;
}

if (typeof window !== "undefined") {
  window.setSessionStateCache = setSessionStateCache;
  window.loadSwaps = loadSwaps;
  window.saveSwaps = saveSwaps;
  window.loadPmStarted = loadPmStarted;
  window.savePmStarted = savePmStarted;
  window.loadSkippedExercises = loadSkippedExercises;
  window.saveSkippedExercises = saveSkippedExercises;
  window.loadDeferred = loadDeferred;
  window.saveDeferred = saveDeferred;
  window.applyDeferredOrder = applyDeferredOrder;
  window.loadBodyweight = loadBodyweight;
  window.saveBodyweight = saveBodyweight;
  window.loadSessionSets = loadSessionSets;
  window.saveSessionSets = saveSessionSets;
  window.serializeForSave = serializeForSave;
  window.autoSavePayload = autoSavePayload;
  window.hydrateToday = hydrateToday;
  window.activateNextSet = activateNextSet;
}

export {
  setSessionStateCache, loadSwaps, saveSwaps, loadPmStarted, savePmStarted,
  loadSkippedExercises, saveSkippedExercises, loadDeferred, saveDeferred, applyDeferredOrder,
  loadBodyweight, saveBodyweight, loadSessionSets, saveSessionSets, serializeForSave,
  autoSavePayload, hydrateToday, activateNextSet,
};
