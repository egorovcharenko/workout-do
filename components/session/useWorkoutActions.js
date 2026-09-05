import { useEffect, useRef } from "react";
import { SWAP_GROUPS, WORKOUTS, TEST_MODE, LS_PREFIX } from "@/lib/legacy/shared";
import { applySwaps } from "@/lib/legacy/standards";
import { saveSwaps, loadSkippedExercises, saveSkippedExercises, saveDeferred, saveBodyweight, saveSessionSets, serializeForSave, finishSavePayload, abandonSession, clearSessionState, activateNextSet } from "@/lib/legacy/session-persistence";
import { flattenTemplate, applyDeloadPrescription } from "@/lib/legacy/session-utils";
import { logSetAndTransition } from "@/lib/legacy/set-logging";
import { platesForExerciseSet } from "@/lib/legacy/bar-stack";
import { optimizeMigratedSquatBackoffs } from "@/lib/legacy/squat-progression";
import { loggedAtForSetUpdate } from "@/lib/legacy/duration-estimates";
import { finishAndExit } from "@/lib/legacy/finish-workout";
import { abandonAndExit } from "@/lib/legacy/abandon-workout";
import {
  buildLibraryExerciseTemplate,
  exerciseNameExists,
  skipRemainingWarmups,
} from "@/lib/legacy/session-mutations";

// ─── file: workout-session-actions.js ───

function useWorkoutActions({
  workout,
  exercises,
  setExercises,
  sessionDate,
  sessionId,
  setSessionId,
  startedAt,
  elapsed,
  swaps,
  setSwaps,
  dataRef,
  startTimer,
  setRest,
  queueSave,
  cancelQueuedSave,
}) {

  const exercisesRef = useRef(exercises);
  const finishInFlightRef = useRef(null);
  const abandonInFlightRef = useRef(null);
  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  const patchSet = (eIdx, sIdx, patch, base = exercisesRef.current) => {
    return base.map((e, i) => i !== eIdx ? e : ({
      ...e,
      sets: e.sets.map((s, j) => j !== sIdx ? s : ({ ...s, ...patch })),
    }));
  };

  const updateAndSave = (next) => {
    if (abandonInFlightRef.current) return;
    exercisesRef.current = next;
    setExercises(next);
    queueSave(next, sessionId, startedAt, elapsed);
    saveSessionSets(workout.name, sessionDate, next);
  };

  const onPickWeight = (eIdx, sIdx, w, base) => {
    startTimer();
    updateAndSave(patchSet(eIdx, sIdx, { weight: w, barPlates: undefined }, base));
  };

  const onPickBodyweight = (eIdx, sIdx, w) => {
    startTimer();
    saveBodyweight(w);
    const next = exercisesRef.current.map(e => e.assist
      ? { ...e, sets: e.sets.map(s => ({ ...s, bodyweight: w })) }
      : e);
    updateAndSave(next);
  };

  const onPickGrip = (eIdx, sIdx, g) => {
    startTimer();
    const current = exercisesRef.current;
    const exercise = current[eIdx];
    if (!exercise?.stages) {
      updateAndSave(patchSet(eIdx, sIdx, { grip: g }));
      return;
    }
    const next = current.map((candidate, index) => index !== eIdx ? candidate : ({
      ...candidate,
      sets: candidate.sets.map((set, setIndex) => {
        const isRemainingWorkingSet = set.kind === "work" && !set.completed;
        return isRemainingWorkingSet || setIndex === sIdx ? { ...set, grip: g } : set;
      }),
    }));
    updateAndSave(next);
  };

  const onToggleBand = (eIdx, sIdx, b) => {
    startTimer();
    const next = exercisesRef.current.map((e, i) => {
      if (i !== eIdx) return e;
      return {
        ...e,
        sets: e.sets.map((s, j) => {
          if (j !== sIdx) return s;
          const cur = s.bands || [];
          let bands;
          if (b === "__use_last__") {
            bands = (s.lastBands || []).slice();
          } else {
            bands = cur.includes(b) ? cur.filter(x => x !== b) : [...cur, b].sort((a, c) => a - c);
          }
          return { ...s, bands };
        }),
      };
    });
    updateAndSave(next);
  };

  const onClearBands = (eIdx, sIdx) => {
    startTimer();
    updateAndSave(patchSet(eIdx, sIdx, { bands: [] }));
  };

  const onLogReps = (eIdx, sIdx, r) => {
    startTimer();
    const current = exercisesRef.current;
    const set = current[eIdx]?.sets[sIdx];
    if (!set) return;
    const patch = {
      reps: r,
      completed: true,
      logged_at: loggedAtForSetUpdate(set, new Date().toISOString()),
    };
    if (current[eIdx].isBarbell) {
      patch.barPlates = platesForExerciseSet(current[eIdx].sets, sIdx);
    }
    const next = logSetAndTransition(current, eIdx, sIdx, patch);
    if (!set.completed) {
      next[eIdx] = optimizeMigratedSquatBackoffs(next[eIdx], sIdx,
        patch.barPlates);
    }

    const ex = next[eIdx];
    // The transition owns set selection — read the newly active set back out
    // instead of re-deriving it with different rules.
    let nextActive = null;
    next.forEach((e2) => e2.sets.forEach((s2) => { if (s2.active) nextActive = { e: e2, s: s2 }; }));

    let shouldRest = !ex.superset;
    if (ex.superset) {
      // Rest only between rounds. The logged set closed round N (its exercise
      // now has N completed working sets); the round is over when every
      // non-skipped partner that has N working sets completed at least N.
      const doneHere = ex.sets.filter(s => s.kind !== "warmup" && s.completed).length;
      shouldRest = next.every((e2) => {
        if (e2.superset !== ex.superset || e2.skipped) return true;
        const work = e2.sets.filter(s => s.kind !== "warmup");
        if (work.length < doneHere) return true; // shorter partner can't block the round
        return work.filter(s => s.completed || s.userSkipped).length >= doneHere;
      });
    }

    if (shouldRest && nextActive) {
      const restKind = nextActive.s.kind === "warmup" ? "warmup" : "work";
      const total = restKind === "warmup" ? 30 : (ex.rest || 90);
      setRest({ total, left: total, endAt: Date.now() + total * 1000, eIdx, sIdx, kind: restKind, paused: false });
    } else {
      setRest(null);
    }

    updateAndSave(next);
  };

  const onReopenSet = (eIdx, sIdx) => {
    const next = exercisesRef.current.map((e, i) => {
      if (i !== eIdx) return e;
      return {
        ...e,
        sets: e.sets.map((s, j) => {
          if (j === sIdx) return { ...s, active: true, completed: false, userSkipped: false };
          if (s.active) return { ...s, active: false };
          return s;
        }),
      };
    });
    const cleaned = next.map((e, i) => i === eIdx ? e : ({
      ...e,
      sets: e.sets.map(s => s.active ? { ...s, active: false } : s),
    }));
    updateAndSave(cleaned);
  };

  const onSkipWarmup = (eIdx) => {
    updateAndSave(skipRemainingWarmups(exercisesRef.current, eIdx));
  };

  const onSkipExercise = (eIdx) => {
    startTimer();
    const next = exercisesRef.current.map((e, i) => {
      if (i !== eIdx) return e;
      const skipped = !e.skipped;
      const sets = e.sets.map(s => ({ ...s, active: false }));
      return { ...e, skipped, sets };
    });
    activateNextSet(next);
    const skippedNames = new Set(next.filter(e => e.skipped).map(e => e.name));
    saveSkippedExercises(workout.name, sessionDate, skippedNames);
    updateAndSave(next);
  };

  const onDeferExercise = (eIdx) => {
    const current = exercisesRef.current;
    const target = current[eIdx];
    if (!target || target.superset) return;
    startTimer();
    const moved = { ...target, deferred: true, sets: target.sets.map(s => ({ ...s, active: false })) };
    const next = [...current.filter((_, i) => i !== eIdx), moved];
    activateNextSet(next);
    saveDeferred(workout.name, sessionDate, next.filter(e => e.deferred).map(e => e.name));
    updateAndSave(next);
  };

  const onSwapExercise = (eIdx, newName) => {
    const current = exercisesRef.current;
    if (exerciseNameExists(current, newName, eIdx)) return;
    startTimer();
    const ex = current[eIdx];
    if (!ex) return;
    const tIdx = ex.templateExIdx;
    const isSub = ex.subIdx != null;
    const swapKey = isSub ? `${tIdx}-${ex.subIdx}` : `${tIdx}`;
    const wrapper = workout.exercises[tIdx];
    const originalName = isSub
      ? (wrapper?.supersetExercises?.[ex.subIdx]?.name || ex.name)
      : (wrapper?.name || ex.name);
    const nextSwaps = { ...swaps };
    if (newName === originalName) delete nextSwaps[swapKey];
    else nextSwaps[swapKey] = newName;
    saveSwaps(workout.name, sessionDate, nextSwaps);
    setSwaps(nextSwaps);
    const { hints } = dataRef.current;
    let exs = flattenTemplate(applySwaps(workout, nextSwaps), {}, hints);
    if (window.SESSION_DELOAD) exs = applyDeloadPrescription(exs);
    exs = exs.map((item, i) => {
      if (i === eIdx) return item;
      const prevEx = current[i];
      if (prevEx && prevEx.name === item.name) {
        return { ...item, sets: prevEx.sets.map(s => ({ ...s })) };
      }
      return item;
    });
    // flattenTemplate only knows the template — re-append custom-added
    // exercises so a swap doesn't erase them (and their logged sets).
    const customs = current
      .filter(e => e.customAdded)
      .map(e => ({ ...e, sets: e.sets.map(s => ({ ...s, active: false })) }));
    if (customs.length) exs = [...exs, ...customs];
    const skippedNames = loadSkippedExercises(workout.name, sessionDate);
    if (skippedNames.size) exs = exs.map(e => skippedNames.has(e.name) ? { ...e, skipped: true } : e);
    activateNextSet(exs);
    updateAndSave(exs);
  };

  const onAddSet = (eIdx) => {
    startTimer();
    const current = exercisesRef.current;
    const targetSuperset = current[eIdx]?.superset;
    const subCount = targetSuperset ? current.filter(ex => ex.superset === targetSuperset).length : 1;
    const next = current.map((e, i) => {
      const match = targetSuperset ? (e.superset === targetSuperset) : (i === eIdx);
      if (!match) return e;
      const lastWork = [...e.sets].reverse().find(s => s.kind === "work");
      const newIdx = (typeof lastWork?.idx === "number" ? lastWork.idx : 0) + 1;
      const isInterleaved = targetSuperset && (e.subIdx !== null && e.subIdx !== undefined);
      const newSetNumber = isInterleaved 
        ? (newIdx - 1) * subCount + e.subIdx + 1
        : (lastWork?.setNumber || 0) + 1;
      const newSet = {
        kind: "work", idx: newIdx, setNumber: newSetNumber,
        saveExerciseName: lastWork?.saveExerciseName || e.name,
        completed: false, active: false, reps: null, weight: lastWork?.weight || 0,
        bodyweight: lastWork?.bodyweight, grip: lastWork?.grip,
        bands: lastWork?.bands ? lastWork.bands.slice() : [],
        lastWeight: null, lastBands: [], lastReps: null,
      };
      return { ...e, sets: [...e.sets, newSet] };
    });
    updateAndSave(next);
  };

  const onRemoveSet = (eIdx) => {
    startTimer();
    const current = exercisesRef.current;
    const targetSuperset = current[eIdx]?.superset;
    const targets = current.filter(e => targetSuperset ? e.superset === targetSuperset : e.id === current[eIdx].id);
    const maxWork = Math.max(...targets.map(e => e.sets.filter(s => s.kind === "work").length));
    const next = current.map((e, i) => {
      if (targetSuperset ? e.superset !== targetSuperset : i !== eIdx) return e;
      const workSets = e.sets.filter(s => s.kind === "work");
      if (workSets.length <= 1) return e;
      if (targetSuperset && workSets.length < maxWork) return e;
      const trailing = workSets[workSets.length - 1];
      if (trailing?.completed) return e;
      let sets = e.sets.filter(s => s !== trailing);
      if (trailing?.active) {
        const reactivate = [...sets].reverse().find(s => s.kind === "work" && !s.completed);
        if (reactivate) sets = sets.map(s => s === reactivate ? { ...s, active: true } : s);
      }
      return { ...e, sets };
    });
    // Removing the trailing set can take the only active set with it (e.g. the
    // exercise's other sets are all logged) — without a fallback the session
    // ends up with no active set and the entry card goes blank.
    if (!next.some(e => e.sets.some(s => s.active))) activateNextSet(next);
    updateAndSave(next);
  };

  const onRemoveWarmup = (eIdx) => {
    startTimer();
    const next = exercisesRef.current.map((e, i) => i !== eIdx ? e : ({ ...e, sets: e.sets.filter(s => s.kind !== "warmup") }));
    // Same guard as onRemoveSet: dropping an active warmup must not leave the
    // session without any active set.
    if (!next.some(e => e.sets.some(s => s.active))) activateNextSet(next);
    updateAndSave(next);
  };

  const onFinishWorkout = (elapsedSec) => {
    if (abandonInFlightRef.current) return abandonInFlightRef.current;
    if (finishInFlightRef.current) return finishInFlightRef.current;
    if (TEST_MODE) {
      window.location.replace("/");
      return Promise.resolve({ status: "test" });
    }
    cancelQueuedSave();
    const payload = {
      ...serializeForSave(exercisesRef.current, workout.name, sessionId, startedAt, elapsedSec, sessionDate),
      finished_at: new Date().toISOString(),
    };
    const finishTask = finishAndExit({
      save: () => finishSavePayload(payload),
      exit: () => window.location.replace("/"),
    }).then(outcome => {
      if (outcome.status === "failed") {
        console.error("[V2-SAVE] finish error:", outcome.error);
      } else if (outcome.status === "timed_out") {
        console.warn("[V2-SAVE] finish save timed out; exiting with completed session state");
      }
      return outcome;
    });
    finishInFlightRef.current = finishTask;
    return finishTask;
  };

  const onAbandonWorkout = () => {
    if (finishInFlightRef.current) return finishInFlightRef.current;
    if (abandonInFlightRef.current) return abandonInFlightRef.current;
    cancelQueuedSave();
    setRest(null);
    localStorage.removeItem(`${LS_PREFIX}v2-rest-timer:${workout.id}`);

    const abandonTask = abandonAndExit({
      discard: TEST_MODE
        ? () => clearSessionState(workout.name, sessionDate)
        : () => abandonSession(workout.name, sessionDate, sessionId),
      exit: () => window.location.replace("/"),
    }).finally(() => {
      abandonInFlightRef.current = null;
    });
    abandonInFlightRef.current = abandonTask;
    return abandonTask;
  };

  const onAddExercise = (name) => {
    const current = exercisesRef.current;
    if (exerciseNameExists(current, name)) return;
    startTimer();
    let official = null;
    if (typeof SWAP_GROUPS !== "undefined" && typeof WORKOUTS !== "undefined") {
      for (const g of SWAP_GROUPS) {
        const f = g.exercises.find(e => e.name === name);
        if (f) { official = f; break; }
      }
      if (!official) {
        for (const w of WORKOUTS) {
          const f = w.exercises.find(e => e.name === name);
          if (f) { official = f; break; }
        }
      }
    }

    const base = buildLibraryExerciseTemplate(name, official);
    let flatAdded = flattenTemplate({ exercises: [base] }, {}, dataRef.current.hints || {});
    if (window.SESSION_DELOAD) flatAdded = applyDeloadPrescription(flatAdded);
    const newEx = {
      ...flatAdded[0],
      id: `${current.length}-${Date.now()}`,
      templateExIdx: current.length,
      customAdded: true,
    };
    if (newEx.sets.length) newEx.sets[0].active = true;
    const next = [...current.map(ex => ({ ...ex, sets: ex.sets.map(s => ({ ...s, active: false })) })), newEx];
    updateAndSave(next);
  };

  return {
    onPickWeight,
    onPickBodyweight,
    onPickGrip,
    onToggleBand,
    onClearBands,
    onLogReps,
    onReopenSet,
    onSkipWarmup,
    onSkipExercise,
    onDeferExercise,
    onSwapExercise,
    onAddSet,
    onRemoveSet,
    onRemoveWarmup,
    onFinishWorkout,
    onAbandonWorkout,
    onAddExercise
  };
}

export { useWorkoutActions };
