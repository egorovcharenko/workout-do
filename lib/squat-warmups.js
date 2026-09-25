// The main-program squat went from four warm-ups (45, 75, 95, 115) to three
// (45, 95, 115). Sessions saved before that keep their four warm-ups because
// saved sets are merged with the template by position; drop the extra warm-up
// that hasn't been done and renumber the rest so they line up with the new
// template. Logged or skipped warm-ups are never removed.
export const SQUAT_EXERCISE = "Barbell Back Squat";
const untouched = set => !set.completed && !set.userSkipped && set.reps == null && !set.logged_at;

export function dropRetiredSquatWarmup(savedSets, templateSets) {
  if (!Array.isArray(savedSets)) return savedSets;
  const warmups = savedSets.filter(set => set.kind === "warmup");
  const templateWarmups = (templateSets || []).filter(set => set.kind === "warmup");
  if (warmups.length !== templateWarmups.length + 1) return savedSets;
  // Prefer the retired 75 lb slot. If the athlete already used that slot
  // (e.g. bumped it to 95 and logged it), the extra is whichever single
  // warm-up is still pending.
  const pending = warmups.filter(untouched);
  const retired = pending.find(set => set.setNumber === 1)
    || (pending.length === 1 ? pending[0] : null);
  if (!retired) return savedSets;
  let next = 0;
  return savedSets.filter(set => set !== retired).map(set => {
    if (set.kind !== "warmup") return set;
    const setNumber = next++;
    return { ...set, setNumber, idx: `W${setNumber + 1}` };
  });
}
