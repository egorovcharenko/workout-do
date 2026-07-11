const DEFAULT_STAGE_TARGET_REPS = 8;

function stageProgression(stages, attempts, requiredSets = 2, targetReps = DEFAULT_STAGE_TARGET_REPS) {
  const ladder = Array.isArray(stages) ? stages : [];
  const required = Math.max(1, Number(requiredSets) || 1);
  const knownStageIds = new Set(ladder.map((stage) => stage.id));
  const normalized = (attempts || []).slice(0, required).map((attempt) => {
    const stageId = attempt?.stageId || attempt?.grip || null;
    const reps = parseInt(attempt?.reps, 10);
    return {
      stageId: knownStageIds.has(stageId) ? stageId : null,
      reps: Number.isFinite(reps) && reps > 0 ? reps : null,
    };
  });
  const recorded = normalized.filter((attempt) => attempt.stageId || attempt.reps != null);
  const stageIds = normalized.map((attempt) => attempt.stageId).filter(Boolean);
  const uniqueStageIds = [...new Set(stageIds)];
  const sameStage = normalized.length === required && stageIds.length === required && uniqueStageIds.length === 1;
  const previousStage = sameStage ? ladder.find((stage) => stage.id === uniqueStageIds[0]) || null : null;
  const reps = sameStage ? normalized.map((attempt) => attempt.reps) : [];
  const complete = sameStage && reps.every((value) => value != null);
  const mastered = complete && reps.every((value) => value >= targetReps);
  const previousIndex = previousStage ? ladder.findIndex((stage) => stage.id === previousStage.id) : -1;
  const nextStage = mastered && previousIndex >= 0 && previousIndex < ladder.length - 1
    ? ladder[previousIndex + 1]
    : null;

  return {
    complete,
    hasHistory: recorded.length > 0,
    mastered,
    masteredTopStage: mastered && previousIndex === ladder.length - 1,
    mixedStages: uniqueStageIds.length > 1,
    nextStage,
    previousStage,
    reps,
    requiredSets: required,
    targetReps,
  };
}

export { DEFAULT_STAGE_TARGET_REPS, stageProgression };
