// Cable load is the stack pin value; the stack runs 10–85 lb in 1 lb steps.
export const WRIST_CURL = {
  name: "Bench-Supported Cable Wrist Curls",
  equipment: "cable",
  sets: 2,
  reps: "15–25",
  workRepRanges: [[15, 25], [15, 25]],
  defaultWork: [10, 10],
  defaultWorkReps: [15, 15],
  noWarmup: true,
  rest: 60,
  targetRir: [1, 2],
  fixedPrescription: true,
  preserveSetCount: true,
  loadProgression: { increment: 1, groups: [[1, 2]], required: 1 },
  notes: "Low pulley. Palms up, forearms supported on the bench, hands just beyond the edge. Curl only your wrists and keep your grip. Pin weight is the stack load. Leave 1–2 reps available; add 1 lb after both sets reach 25 with reserve.",
};
