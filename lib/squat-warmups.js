// The main-program squat went from four warm-ups (45, 75, 95, 115) to three
// (45, 95, 115). Sessions saved before that keep their four warm-ups because
// saved sets are merged with the template by position; drop the retired 75 lb
// warm-up when it was never touched and renumber the rest so they line up
// with the new template. A logged or skipped 75 lb warm-up is left alone.
export const SQUAT_EXERCISE = "Barbell Back Squat";
const RETIRED_WEIGHT = 75;

const untouched = set => !set.completed && !set.userSkipped && set.reps == null && !set.logged_at;

export function dropRetiredSquatWarmup(savedSets, templateSets) {
  if (!Array.isArray(savedSets)) return savedSets;
  const warmups = savedSets.filter(set => set.kind === "warmup");
  const templateWarmups = (templateSets || []).filter(set => set.kind === "warmup");
  if (warmups.length !== templateWarmups.length + 1) return savedSets;
  const retired = warmups.find(set => set.setNumber === 1 && Number(set.weight) === RETIRED_WEIGHT && untouched(set));
  if (!retired) return savedSets;
  let next = 0;
  return savedSets.filter(set => set !== retired).map(set => {
    if (set.kind !== "warmup") return set;
    const setNumber = next++;
    return { ...set, setNumber, idx: `W${setNumber + 1}` };
  });
}
