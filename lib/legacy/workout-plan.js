function canonicalWorkoutName(name, aliases = {}) {
  return aliases[name] || name;
}

function sessionTime(session) {
  const started = session?.started_at ? Date.parse(session.started_at) : Number.NaN;
  if (Number.isFinite(started)) return started;
  const dated = session?.date ? Date.parse(`${session.date}T23:59:59`) : Number.NaN;
  return Number.isFinite(dated) ? dated : 0;
}

// Return the still-unfulfilled queue without mutating the persisted plan.
// Completed sessions consume matching entries that existed when the workout
// began; unfinished sessions remain in activeSessions and consume nothing.
function consumeSatisfiedPlanEntries(entries, sessions, activeSessions, aliases = {}) {
  const remaining = Array.isArray(entries) ? entries.slice() : [];
  if (!remaining.length) return remaining;

  const activeIds = new Set((activeSessions || []).map((session) => session.id));
  const completed = (sessions || [])
    .filter((session) =>
      !activeIds.has(session.id) &&
      (session.sets || []).some((set) => set.reps),
    )
    .slice()
    .sort((a, b) => sessionTime(a) - sessionTime(b));

  completed.forEach((session) => {
    const workoutName = canonicalWorkoutName(session.workout_name, aliases);
    const completedAt = sessionTime(session);
    const index = remaining.findIndex((entry) => {
      if (canonicalWorkoutName(entry.workout, aliases) !== workoutName) return false;
      if (!entry.added) return true;
      const addedAt = Date.parse(entry.added);
      return Number.isFinite(addedAt) && addedAt <= completedAt;
    });
    if (index !== -1) remaining.splice(index, 1);
  });

  return remaining;
}

export {
  canonicalWorkoutName,
  consumeSatisfiedPlanEntries,
};
