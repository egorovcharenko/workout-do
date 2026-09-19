// Weight is per dumbbell; both wrists are trained in each set.
export const WRIST_CURL = {
  name: "Bench-Supported Dumbbell Wrist Curls",
  equipment: "dumbbell",
  sets: 2,
  reps: "15–25",
  workRepRanges: [[15, 25], [15, 25]],
  defaultWork: [5, 5],
  defaultWorkReps: [15, 15],
  noWarmup: true,
  rest: 60,
  targetRir: [1, 2],
  fixedPrescription: true,
  preserveSetCount: true,
  loadProgression: { increment: 2.5, groups: [[1, 2]], required: 1 },
  notes: "Palms up, forearms supported on the bench, hands just beyond the edge. Curl only your wrists and keep your grip. Weight is per dumbbell. Leave 1–2 reps available; add 2.5 lb after both sets reach 25 with reserve.",
};
