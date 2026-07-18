import { SWAP_GROUPS, WORKOUTS, TEST_MODE } from "@/lib/legacy/shared";
import { applySwaps } from "@/lib/legacy/standards";
import { saveSwaps, loadSkippedExercises, saveSkippedExercises, saveDeferred, saveBodyweight, saveSessionSets, serializeForSave, finishSavePayload, activateNextSet } from "@/lib/legacy/session-persistence";
import { flattenTemplate, applyDeloadPrescription, transitionActiveSetAfterLog } from "@/lib/legacy/session-utils";
import { isBeltLoadExercise } from "@/lib/legacy/belt-load";
import { loggedAtForSetUpdate } from "@/lib/legacy/duration-estimates";

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
  queueSave
}) {

  const patchSet = (eIdx, sIdx, patch, base = exercises) => {
    return base.map((e, i) => i !== eIdx ? e : ({
      ...e,
      sets: e.sets.map((s, j) => j !== sIdx ? s : ({ ...s, ...patch })),
    }));
  };

  const updateAndSave = (next) => {
    setExercises(next);
    queueSave(next, sessionId, startedAt, elapsed);
    saveSessionSets(workout.name, sessionDate, next);
  };

  const onPickWeight = (eIdx, sIdx, w, base) => {
    startTimer();
    updateAndSave(patchSet(eIdx, sIdx, { weight: w }, base));
  };

  const onPickBodyweight = (eIdx, sIdx, w) => {
    startTimer();
    saveBodyweight(w);
    const next = exercises.map(e => e.assist
      ? { ...e, sets: e.sets.map(s => ({ ...s, bodyweight: w })) }
      : e);
    updateAndSave(next);
  };

  const onPickGrip = (eIdx, sIdx, g) => {
    startTimer();
    const exercise = exercises[eIdx];
    if (!exercise?.stages) {
      updateAndSave(patchSet(eIdx, sIdx, { grip: g }));
      return;
    }
    const next = exercises.map((candidate, index) => index !== eIdx ? candidate : ({
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
    const next = exercises.map((e, i) => {
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
    const set = exercises[eIdx]?.sets[sIdx];
    let next = patchSet(eIdx, sIdx, {
      reps: r,
      completed: true,
      logged_at: loggedAtForSetUpdate(set, new Date().toISOString()),
    });

    const ex = next[eIdx];
    const inSuperset = !!ex.superset;
    let shouldRest = !inSuperset;
    if (inSuperset) {
      const isRoundEnd = next.every((e2) => {
        if (e2.superset !== ex.superset || e2.skipped) return true;
        const setAtIdx = e2.sets[sIdx];
        return !setAtIdx || setAtIdx.completed;
      });
      shouldRest = isRoundEnd;
    }

    if (shouldRest) {
      let nextSet = null;
      const sameExNextIdx = ex.sets.findIndex((s, k) => k > sIdx && !s.completed);
      if (sameExNextIdx !== -1) {
        nextSet = ex.sets[sameExNextIdx];
      } else {
        const nextExIdx = next.findIndex((e, k) => k > eIdx && e.sets.some(s => !s.completed));
        if (nextExIdx !== -1) {
          nextSet = next[nextExIdx].sets.find(s => !s.completed);
        }
      }

      if (nextSet) {
        const restKind = nextSet.kind === "warmup" ? "warmup" : "work";
        const total = restKind === "warmup" ? 30 : (ex.rest || 90);
        setRest({ total, left: total, endAt: Date.now() + total * 1000, eIdx, sIdx, kind: restKind, paused: false });
      } else {
        setRest(null);
      }
    } else {
      setRest(null);
    }

    setTimeout(() => {
      // Updaters must stay pure for React, so guard the save side effects
      // against a double invocation of the updater.
      let persisted = false;
      setExercises(prev => {
        const transitioned = transitionActiveSetAfterLog(prev, eIdx, sIdx);
        if (!persisted) {
          persisted = true;
          queueSave(transitioned, sessionId, startedAt, elapsed);
          saveSessionSets(workout.name, sessionDate, transitioned);
        }
        return transitioned;
      });
    }, 350);

    updateAndSave(next);
  };

  const onReopenSet = (eIdx, sIdx) => {
    const next = exercises.map((e, i) => {
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
    const next = exercises.map((e, i) => {
      if (i !== eIdx) return e;
      const sets = e.sets.map(s => s.kind === "warmup" ? { ...s, active: false, completed: false, userSkipped: true } : s);
      const firstWork = sets.findIndex(s => s.kind === "work" && !s.completed);
      if (firstWork !== -1) sets[firstWork] = { ...sets[firstWork], active: true };
      return { ...e, sets };
    });
    updateAndSave(next);
  };

  const onSkipExercise = (eIdx) => {
    startTimer();
    const next = exercises.map((e, i) => {
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
    const target = exercises[eIdx];
    if (!target || target.superset) return;
    startTimer();
    const moved = { ...target, deferred: true, sets: target.sets.map(s => ({ ...s, active: false })) };
    const next = [...exercises.filter((_, i) => i !== eIdx), moved];
    activateNextSet(next);
    saveDeferred(workout.name, sessionDate, next.filter(e => e.deferred).map(e => e.name));
    updateAndSave(next);
  };

  const onSwapExercise = (eIdx, newName) => {
    startTimer();
    const ex = exercises[eIdx];
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
    const { last, hints } = dataRef.current;
    let exs = flattenTemplate(applySwaps(workout, nextSwaps), last, hints);
    if (window.SESSION_DELOAD) exs = applyDeloadPrescription(exs);
    exs = exs.map((item, i) => {
      if (i === eIdx) return item;
      const prevEx = exercises[i];
      if (prevEx && prevEx.name === item.name) {
        return { ...item, sets: prevEx.sets.map(s => ({ ...s })) };
      }
      return item;
    });
    // flattenTemplate only knows the template — re-append custom-added
    // exercises so a swap doesn't erase them (and their logged sets).
    const customs = exercises
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
    const targetSuperset = exercises[eIdx]?.superset;
    const subCount = targetSuperset ? exercises.filter(ex => ex.superset === targetSuperset).length : 1;
    const next = exercises.map((e, i) => {
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
    const targetSuperset = exercises[eIdx]?.superset;
    const targets = exercises.filter(e => targetSuperset ? e.superset === targetSuperset : e.id === exercises[eIdx].id);
    const maxWork = Math.max(...targets.map(e => e.sets.filter(s => s.kind === "work").length));
    const next = exercises.map((e, i) => {
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
    updateAndSave(next);
  };

  const onRemoveWarmup = (eIdx) => {
    startTimer();
    const next = exercises.map((e, i) => i !== eIdx ? e : ({ ...e, sets: e.sets.filter(s => s.kind !== "warmup") }));
    updateAndSave(next);
  };

  const onFinishWorkout = (elapsedSec) => {
    if (TEST_MODE) { window.location.href = "/"; return; }
    const payload = {
      ...serializeForSave(exercises, workout.name, sessionId, startedAt, elapsedSec, sessionDate),
      finished_at: new Date().toISOString(),
    };
    finishSavePayload(payload).catch(e => console.error("[V2-SAVE] finish error:", e)).finally(() => {
      window.location.href = "/";
    });
  };

  const onAddExercise = (name) => {
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

    const base = {
      name,
      sets: official ? (official.sets || 3) : 3,
      reps: official ? (official.reps || "8-12") : "8-12",
      notes: official ? (official.notes || "Added from library.") : "Added from library.",
      equipment: official ? (official.equipment || (name.toLowerCase().includes("barbell") ? "barbell" : name.toLowerCase().includes("band") ? "band" : "dumbbell")) : (name.toLowerCase().includes("barbell") ? "barbell" : name.toLowerCase().includes("band") ? "band" : "dumbbell"),
      noWarmup: official ? !!official.noWarmup : false,
      assist: official ? !!official.assist : false,
      repsOnly: official ? !!official.repsOnly : false,
      beltLoad: isBeltLoadExercise(name),
      rest: official ? (official.rest || 60) : 60,
      video: official ? (official.video || null) : null,
      grips: official ? (official.grips || null) : null,
    };
    let flatAdded = flattenTemplate({ exercises: [base] }, {}, dataRef.current.hints || {});
    if (window.SESSION_DELOAD) flatAdded = applyDeloadPrescription(flatAdded);
    const newEx = {
      ...flatAdded[0],
      id: `${exercises.length}-${Date.now()}`,
      templateExIdx: exercises.length,
      customAdded: true,
    };
    if (newEx.sets.length) newEx.sets[0].active = true;
    const next = [...exercises.map(ex => ({ ...ex, sets: ex.sets.map(s => ({ ...s, active: false })) })), newEx];
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
    onAddExercise
  };
}

export { useWorkoutActions };
