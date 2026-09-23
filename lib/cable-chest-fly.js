export const CABLE_CHEST_FLY = {
  name: "Cable Chest Fly",
  equipment: "cable",
  prescriptionVersion: 1,
  sets: 3,
  reps: "12–20",
  workRepRanges: [[12, 20], [12, 20], [12, 20]],
  defaultWork: [10, 10, 10],
  defaultWorkReps: [12, 12, 12],
  warmups: 1,
  defaultWarmup: [10],
  defaultWarmupReps: [10],
  rest: 90,
  targetRir: [2, 2],
  fixedPrescription: true,
  preserveSetCount: true,
  loadProgression: { increment: 1.25, groups: [[1, 2, 3]], required: 1 },
  notes: "Weight is per stack. Start light and adjust to 12–20 controlled reps with 2 reps in reserve. Pulleys around shoulder height, slight elbow bend; bring your hands together in front of your chest. Increase each stack by 1.25 lb when all three sets reach 20 with reserve.",
};

// Upgrade sessions opened before this prescription was released. Once upgraded,
// saved version markers let deliberate set/warm-up removals stay removed.
export function restoreChestFlyPrescription(templateSets, savedSets) {
  if (!savedSets?.length || savedSets.some(set => set.prescriptionVersion >= CABLE_CHEST_FLY.prescriptionVersion)) return savedSets;
  const key = set => `${set.kind}:${set.setNumber}`;
  const existing = new Set(savedSets.map(key));
  const lastWork = savedSets.filter(set => set.kind === 'work').at(-1);
  const additions = templateSets.filter(set => !existing.has(key(set))).map(set => ({
    ...set,
    ...(set.kind === 'work' && lastWork?.weight != null ? { weight: lastWork.weight } : {}),
  }));
  return [...savedSets, ...additions]
    .map(set => ({ ...set, prescriptionVersion: CABLE_CHEST_FLY.prescriptionVersion }))
    .sort((a, b) => (a.kind === 'warmup' ? 0 : 1) - (b.kind === 'warmup' ? 0 : 1) || a.setNumber - b.setNumber);
}
