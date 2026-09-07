const RIR_OPTIONS = [
  { value: "0", label: "0" },
  { value: "1-2", label: "1–2" },
  { value: "3-4", label: "3–4" },
  { value: "5+", label: "5+" },
];

function normalizeRir(value) {
  return RIR_OPTIONS.some(option => option.value === value) ? value : null;
}

function toggleSetRir(exercises, eIdx, sIdx, value) {
  const set = exercises[eIdx]?.sets[sIdx];
  const picked = normalizeRir(value);
  if (!set || picked == null) return exercises;
  const rir = set.rir === picked ? null : picked;
  return exercises.map((exercise, i) => i !== eIdx ? exercise : ({
    ...exercise,
    sets: exercise.sets.map((candidate, j) => j !== sIdx ? candidate : { ...candidate, rir }),
  }));
}

// Keep the just-logged set editable after logging advances to the next exercise
// or superset partner. RIR edits never change logged_at, completion or selection.
function latestLoggedSet(exercises) {
  let latest = null;
  exercises.forEach((exercise, eIdx) => exercise.sets.forEach((set, sIdx) => {
    if (!set.completed || !set.logged_at) return;
    if (!latest || set.logged_at >= latest.set.logged_at) latest = { exercise, set, eIdx, sIdx };
  }));
  return latest;
}

export { RIR_OPTIONS, normalizeRir, toggleSetRir, latestLoggedSet };
