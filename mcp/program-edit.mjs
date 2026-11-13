// Pure program edits: the same draft → saved shape the Workout builder UI
// writes to settings.program_builder, with no browser and no Firestore.
// Every mutation takes a settings object and returns the next saved JSON, so
// the MCP server stays a thin wrapper around these functions.
import { MAIN_WORKOUTS, workoutDisplayName } from "../lib/legacy/shared.js";
import {
  PROGRAM_BUILDER_KEY, PROGRAM_BUILDER_VERSION, applyProgramBuilder, exerciseEntry, exerciseLibrary,
  migrateSavedWorkoutExercises, normalizeEntry, normalizeSupersets, parseProgramBuilder,
  plannedWeeklyMuscleSets, registerExerciseAliases, workoutEntries,
} from "../lib/program-builder.js";

export { PROGRAM_BUILDER_KEY };

const DEFAULT_NAMES = Object.fromEntries(MAIN_WORKOUTS.map(w => [w.id, workoutDisplayName(w.name)]));
const defaults = () => Object.fromEntries(MAIN_WORKOUTS.map(w => [w.id, { name: DEFAULT_NAMES[w.id], exercises: workoutEntries(w) }]));
const slug = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** The builder's own draft: code defaults with saved edits laid over them. */
export function draftFromSettings(settings) {
  const saved = parseProgramBuilder(settings);
  registerExerciseAliases(saved?.aliases || {});
  const base = defaults();
  for (const id of Object.keys(base)) {
    const edit = saved?.workouts?.[id];
    if (edit?.name) base[id].name = edit.name;
    if (Array.isArray(edit?.exercises)) {
      const entries = normalizeSupersets(edit.exercises.map(entry => ({ ...normalizeEntry(entry), superset: null })));
      // Same migration the session builder applies, so an edit made here saves
      // the list a session would actually show (and stops the appending).
      const code = MAIN_WORKOUTS.find(w => w.id === id);
      base[id].exercises = code
        ? migrateSavedWorkoutExercises(entries, { ...code, exercises: workoutEntries(code) }, saved?.version)
        : entries;
    }
  }
  return { draft: base, aliases: saved?.aliases || {} };
}

/** Only workouts that differ from the code program are stored (builder rule). */
export function toSaved(draft, aliases = {}) {
  const base = defaults();
  const workouts = {};
  for (const [id, workout] of Object.entries(draft)) {
    const edit = {};
    const name = String(workout.name || "").trim();
    if (name && name !== base[id].name) edit.name = name;
    if (JSON.stringify(workout.exercises) !== JSON.stringify(base[id].exercises)) edit.exercises = workout.exercises;
    if (Object.keys(edit).length) workouts[id] = edit;
  }
  const used = new Set(Object.values(draft).flatMap(w => w.exercises.map(e => e.name)));
  const kept = Object.fromEntries(Object.entries(aliases).filter(([alias]) => used.has(alias)));
  return { version: PROGRAM_BUILDER_VERSION, workouts, ...(Object.keys(kept).length ? { aliases: kept } : {}) };
}

export function resolveWorkoutId(draft, key) {
  const wanted = slug(key);
  if (!wanted) throw new Error(`Name a workout: ${Object.keys(draft).join(", ")}`);
  const ids = Object.keys(draft);
  const hit = ids.find(id => slug(id) === wanted)
    || ids.find(id => slug(draft[id].name) === wanted)
    || ids.find(id => slug(MAIN_WORKOUTS.find(w => w.id === id)?.name) === wanted)
    || ids.find(id => slug(draft[id].name).includes(wanted) || slug(id).includes(wanted));
  if (!hit) throw new Error(`No workout matches "${key}". Have: ${ids.map(id => `${id} (${draft[id].name})`).join(", ")}`);
  return hit;
}

function findIndex(draft, id, name) {
  const wanted = slug(name);
  const list = draft[id].exercises;
  const index = list.findIndex(entry => slug(entry.name) === wanted);
  if (index !== -1) return index;
  const loose = list.findIndex(entry => slug(entry.name).includes(wanted));
  if (loose !== -1) return loose;
  throw new Error(`"${name}" is not in ${draft[id].name}. Has: ${list.map(entry => entry.name).join(", ")}`);
}

const repsText = (entry) => {
  const parts = entry.sets.map((range, i) => `${range ? (range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`) : "RIR"}${entry.rir?.[i] != null ? ` @${entry.rir[i]}` : ""}`);
  return parts.filter((part, i) => parts.indexOf(part) === i).join(" / ");
};

function renderEntry(entry, position) {
  return {
    position, name: entry.name, sets: entry.sets.length, reps: repsText(entry),
    rest_sec: entry.rest, warmups: entry.warmups?.length || 0,
    ...(entry.superset ? { superset: entry.superset } : {}),
  };
}

export function renderWorkout(draft, id) {
  return { id, name: draft[id].name, exercises: draft[id].exercises.map((entry, i) => renderEntry(entry, i + 1)),
    working_sets: draft[id].exercises.reduce((n, entry) => n + entry.sets.length, 0) };
}

export function renderProgram(settings) {
  const { draft, aliases } = draftFromSettings(settings);
  const saved = parseProgramBuilder(settings);
  const applied = applyProgramBuilder(MAIN_WORKOUTS, { aliases, workouts: Object.fromEntries(
    Object.entries(draft).map(([id, w]) => [id, { exercises: w.exercises }])) });
  return {
    workouts: Object.keys(draft).map(id => ({
      ...renderWorkout(draft, id),
      edited: !!saved?.workouts?.[id],
      session_name: MAIN_WORKOUTS.find(w => w.id === id)?.name,
    })),
    weekly_sets_per_muscle: Object.fromEntries(plannedWeeklyMuscleSets(applied)
      .map(row => [row.label || row.id, { sets: row.perWeek, target: row.target, status: row.status }])),
  };
}

export function libraryNames(query = "") {
  const wanted = String(query || "").trim().toLowerCase();
  return [...exerciseLibrary().keys()].filter(name => name.toLowerCase().includes(wanted)).sort();
}

function buildEntry(name, { sets, reps, rir, rest } = {}) {
  const base = exerciseLibrary().get(name);
  if (!base) throw new Error(`"${name}" is not in the exercise library. Call library_list to see the names.`);
  const entry = { ...exerciseEntry(base), superset: null };
  return applyFields(entry, { sets, reps, rir, rest });
}

function applyFields(entry, { sets, reps, rir, rest, warmups } = {}) {
  let next = { ...entry, sets: [...entry.sets], rir: [...(entry.rir || [])], warmups: [...(entry.warmups || [])] };
  if (sets != null) {
    const count = Math.max(1, Math.round(sets));
    next.sets = Array.from({ length: count }, (_, i) => next.sets[i] ?? next.sets[next.sets.length - 1] ?? null);
    next.rir = Array.from({ length: count }, (_, i) => next.rir[i] ?? null);
  }
  if (reps != null) {
    const range = Array.isArray(reps) ? [Math.round(reps[0]), Math.round(reps[1] ?? reps[0])] : [Math.round(reps), Math.round(reps)];
    if (!(range[0] > 0) || range[1] < range[0]) throw new Error("reps must be [min, max] with max ≥ min ≥ 1.");
    next.sets = next.sets.map(() => [range[0], range[1]]);
  }
  if (rir !== undefined) next.rir = next.sets.map(() => rir == null ? null : Math.max(0, Math.min(10, Math.round(rir))));
  if (rest != null) next.rest = Math.max(15, Math.min(600, Math.round(rest / 15) * 15));
  if (warmups != null) {
    next.warmups = Array.from({ length: Math.max(0, Math.round(warmups)) }, (_, i) => next.warmups[i] || { weight: null, reps: 5 });
  }
  return normalizeEntry(next);
}

/** Each mutation: settings in, { saved, workout, summary } out. */
function commit(draft, aliases, id, summary) {
  draft[id].exercises = normalizeSupersets(draft[id].exercises);
  return { saved: toSaved(draft, aliases), workout: renderWorkout(draft, id), summary };
}

export function addExercise(settings, { workout, name, sets, reps, rir, rest, position }) {
  const { draft, aliases } = draftFromSettings(settings);
  const id = resolveWorkoutId(draft, workout);
  const canonical = libraryNames().find(candidate => slug(candidate) === slug(name))
    || libraryNames().find(candidate => slug(candidate).includes(slug(name)));
  if (!canonical) throw new Error(`"${name}" is not in the exercise library. Call library_list to see the names.`);
  if (draft[id].exercises.some(entry => entry.name === canonical)) {
    throw new Error(`${canonical} is already in ${draft[id].name}; use exercise_update instead.`);
  }
  const entry = buildEntry(canonical, { sets, reps, rir, rest });
  const list = draft[id].exercises;
  const at = position == null ? list.length : Math.max(0, Math.min(list.length, Math.round(position) - 1));
  list.splice(at, 0, entry);
  return commit(draft, aliases, id, `Added ${canonical} to ${draft[id].name} at position ${at + 1} (${entry.sets.length} × ${repsText(entry)}).`);
}

export function removeExercise(settings, { workout, name }) {
  const { draft, aliases } = draftFromSettings(settings);
  const id = resolveWorkoutId(draft, workout);
  const index = findIndex(draft, id, name);
  if (draft[id].exercises.length <= 1) throw new Error(`${draft[id].name} would be left empty.`);
  const [gone] = draft[id].exercises.splice(index, 1);
  return commit(draft, aliases, id, `Removed ${gone.name} from ${draft[id].name}.`);
}

export function updateExercise(settings, { workout, name, sets, reps, rir, rest, warmups }) {
  const { draft, aliases } = draftFromSettings(settings);
  const id = resolveWorkoutId(draft, workout);
  const index = findIndex(draft, id, name);
  const entry = applyFields(draft[id].exercises[index], { sets, reps, rir, rest, warmups });
  draft[id].exercises[index] = entry;
  return commit(draft, aliases, id, `${entry.name} in ${draft[id].name} is now ${entry.sets.length} × ${repsText(entry)}, ${entry.rest}s rest, ${entry.warmups.length} warm-ups.`);
}

export function moveExercise(settings, { workout, name, position }) {
  const { draft, aliases } = draftFromSettings(settings);
  const id = resolveWorkoutId(draft, workout);
  const index = findIndex(draft, id, name);
  const list = draft[id].exercises;
  const to = Math.max(0, Math.min(list.length - 1, Math.round(position) - 1));
  const [entry] = list.splice(index, 1);
  list.splice(to, 0, entry);
  return commit(draft, aliases, id, `${entry.name} is now exercise ${to + 1} of ${list.length} in ${draft[id].name}.`);
}

export function renameWorkout(settings, { workout, name }) {
  const { draft, aliases } = draftFromSettings(settings);
  const id = resolveWorkoutId(draft, workout);
  const next = String(name || "").trim().slice(0, 40);
  if (!next) throw new Error("Give the workout a name.");
  const was = draft[id].name;
  draft[id].name = next;
  return commit(draft, aliases, id, `Renamed ${was} to ${next} (saved session names are untouched).`);
}

export function resetWorkout(settings, { workout }) {
  const { draft, aliases } = draftFromSettings(settings);
  const id = resolveWorkoutId(draft, workout);
  draft[id] = defaults()[id];
  return commit(draft, aliases, id, `${draft[id].name} is back to the code program.`);
}
