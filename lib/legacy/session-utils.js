// Workout Tracker Session Utilities (Non-React Helpers)

import { GRIP_LABELS, interleavedSetNumber, findExerciseConfig } from "./shared";
import { loadBodyweight } from "./session-persistence";

function flattenTemplate(workout, lastSessionMap, hintsMap) {
  hintsMap = hintsMap || {};
  const lookupLast = (key) => hintsMap[key] || lastSessionMap[key] || null;
  const exerciseGripCache = {};
  const lookupExerciseGrip = (exName) => {
    if (exerciseGripCache[exName] !== undefined) return exerciseGripCache[exName];
    let found = null;
    const scan = (src, kF) => Object.keys(src || {}).forEach(k => {
      const [n, kind] = k.split("|");
      if (!found && n === exName && (!kF || kind === kF) && src[k].grip) found = src[k].grip;
    });
    scan(hintsMap, "working"); scan(lastSessionMap, "working"); scan(hintsMap, "warmup"); scan(lastSessionMap, "warmup");
    return exerciseGripCache[exName] = found;
  };
  const out = [];
  let supersetLetter = 'A';
  workout.exercises.forEach((ex, exIdx) => {
    if (ex.supersetExercises) {
      const subs = ex.supersetExercises;
      const letter = supersetLetter;
      supersetLetter = String.fromCharCode(supersetLetter.charCodeAt(0) + 1);
      let hasGlobalSuperset = false;
      subs.forEach(sub => {
        if (Object.keys(hintsMap || {}).some(k => {
          const [exName, kind] = k.split("|");
          return exName === sub.name && kind === "working";
        })) {
          hasGlobalSuperset = true;
        }
      });
      const supersetSources = hasGlobalSuperset ? [hintsMap] : [lastSessionMap];

      let maxLastSets = 0;
      subs.forEach(sub => {
        supersetSources.forEach(src => {
          Object.keys(src || {}).forEach(k => {
            const [exName, kind, setNumStr] = k.split("|");
            if (exName === sub.name && kind === "working") {
              const num = parseInt(setNumStr);
              if (num > maxLastSets) maxLastSets = num;
            }
          });
        });
      });
      const rounds = ex.sets || 3;
      subs.forEach((sub, subIdx) => {
        const sets = [];
        let subWorkingBySetNum = {};
        supersetSources.forEach(src => {
          Object.keys(src || {}).forEach(k => {
            const [exName, kind, setNumStr] = k.split("|");
            if (exName === sub.name && kind === "working") {
              subWorkingBySetNum[parseInt(setNumStr)] = src[k];
            }
          });
        });
        const subFallback = (want) => {
          if (subWorkingBySetNum[want] != null) return subWorkingBySetNum[want];
          const nums = Object.keys(subWorkingBySetNum).map(Number).sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
          return nums.length ? subWorkingBySetNum[nums[0]] : null;
        };
        const subExerciseGrip = lookupExerciseGrip(sub.name);
        const subIsAssist = !!sub.assist;
        const subIsRepsOnly = !!sub.repsOnly;
        const subIsBandOnly = sub.equipment === "band" && !sub.bandAddon && !subIsAssist;
        for (let r = 0; r < rounds; r++) {
          const setNumber = interleavedSetNumber(r, subIdx, subs.length);
          const last = subFallback(setNumber) || lookupLast(`${sub.name}|working|${setNumber}`);
          sets.push(buildSet({
            kind: "work", idx: r + 1,
            template: sub,
            last,
            setNumber,
            saveExerciseName: sub.name,
            isAssist: subIsAssist,
            isBandOnly: subIsBandOnly,
            fallbackGrip: subExerciseGrip,
          }));
        }
        out.push({
          id: `${exIdx}-${subIdx}`,
          templateExIdx: exIdx,
          subIdx,
          name: sub.name,
          mode: subIsAssist ? "bodyweight" : undefined,
          superset: letter,
          supersetPos: subIdx + 1,
          repRange: sub.reps,
          note: sub.notes || ex.notes || "",
          rest: ex.rest || 60,
          grips: sub.grips ? sub.grips.map(g => ({ id: g, ...GRIP_LABELS[g] })) : null,
          stages: sub.stages || null,
          isBandsOnly: subIsBandOnly,
          bandAddon: !!sub.bandAddon,
          assist: subIsAssist,
          repsOnly: subIsRepsOnly,
          isBarbell: sub.equipment === "barbell" || sub.name.includes("Barbell") || sub.name === "Standing Overhead Press",
          equipment: sub.equipment || null,
          session: ex.session || null,
          sets,
        });
      });
    } else {
      const sets = [];
      const isAssist = !!ex.assist;
      const isRepsOnly = !!ex.repsOnly;
      const isBandOnly = ex.equipment === "band" && !ex.bandAddon && !isAssist;
      const hasGlobalWarmup = Object.keys(hintsMap || {}).some(k => {
        const [exName, kind] = k.split("|");
        return exName === ex.name && kind === "warmup";
      });
      const warmupSources = hasGlobalWarmup ? [hintsMap] : [lastSessionMap];

      if (!ex.noWarmup) {
        let warmupLastBySetNum = {};
        warmupSources.forEach(src => {
          Object.keys(src || {}).forEach(k => {
            const [exName, kind, setNumStr] = k.split("|");
            if (exName === ex.name && kind === "warmup") warmupLastBySetNum[parseInt(setNumStr)] = src[k];
          });
        });
        const warmupCount = ex.warmups || 1;
        const fallbackForWarmup = (want) => {
          return warmupLastBySetNum[want] || null;
        };
        const exGripFallback = lookupExerciseGrip(ex.name);
        for (let wi = 0; wi < warmupCount; wi++) {
          const setNumber = wi;
          const last = fallbackForWarmup(setNumber);
          sets.push(buildSet({
            kind: "warmup",
            idx: warmupCount > 1 ? `W${wi + 1}` : "W",
            template: ex,
            last,
            setNumber,
            saveExerciseName: ex.name,
            isAssist, isBandOnly,
            fallbackGrip: exGripFallback,
          }));
        }
      }
      
      const hasGlobalWorking = Object.keys(hintsMap || {}).some(k => {
        const [exName, kind] = k.split("|");
        return exName === ex.name && kind === "working";
      });
      const workingSources = hasGlobalWorking ? [hintsMap] : [lastSessionMap];

      let workingLastBySetNum = {};
      workingSources.forEach(src => {
        Object.keys(src || {}).forEach(k => {
          const [exName, kind, setNumStr] = k.split("|");
          if (exName === ex.name && kind === "working") {
            const num = parseInt(setNumStr);
            if (ex.name === "Pull-Ups" && num === 0) return;
            workingLastBySetNum[num] = src[k];
          }
        });
      });
      const sortedHistNums = Object.keys(workingLastBySetNum).map(Number).sort((a, b) => a - b);
      const fallbackForWorking = (idx) => {
        if (idx < sortedHistNums.length) return workingLastBySetNum[sortedHistNums[idx]];
        if (sortedHistNums.length > 0) return workingLastBySetNum[sortedHistNums[sortedHistNums.length - 1]];
        return null;
      };
      const workGripFallback = lookupExerciseGrip(ex.name);
      if (ex.name === "Pull-Ups") {
        const uaSet = buildSet({
          kind: "work", idx: "UA",
          template: ex,
          last: lookupLast(`${ex.name}|working|0`),
          setNumber: 0,
          saveExerciseName: ex.name,
          isAssist: true,
          isBandOnly: false,
          fallbackGrip: workGripFallback,
        });
        uaSet.bands = [];
        uaSet.lastBands = [];
        sets.push(uaSet);
      }
      const workingCount = ex.sets || 3;
      for (let i = 0; i < workingCount; i++) {
        const setNumber = i + 1;
        const last = fallbackForWorking(i);
        sets.push(buildSet({
          kind: "work", idx: i + 1,
          template: ex,
          last,
          setNumber,
          saveExerciseName: ex.name,
          fallbackGrip: workGripFallback,
          isAssist, isBandOnly,
        }));
      }
      out.push({
        id: String(exIdx),
        templateExIdx: exIdx,
        subIdx: null,
        name: ex.name,
        mode: isAssist ? "bodyweight" : undefined,
        superset: ex.superset || null,
        supersetPos: null,
        repRange: ex.reps,
        note: ex.notes || "",
        rest: ex.rest || 60,
        grips: ex.grips ? ex.grips.map(g => ({ id: g, ...GRIP_LABELS[g] })) : null,
        stages: ex.stages || null,
        isBandsOnly: isBandOnly,
        bandAddon: !!ex.bandAddon,
        assist: isAssist,
        repsOnly: isRepsOnly,
        isBarbell: ex.equipment === "barbell" || ex.name.includes("Barbell") || ex.name === "Standing Overhead Press",
        equipment: ex.equipment || null,
        session: ex.session || null,
        sets,
      });
    }
  });
  return out;
}

function buildSet({ kind, idx, template, last, setNumber, saveExerciseName, isAssist, isBandOnly, fallbackGrip }) {
  const set = { kind, idx, setNumber, saveExerciseName, completed: false, active: false, reps: null };
  let defW = null, defR = null;
  if (kind === "warmup" && template.defaultWarmup) {
    defW = template.defaultWarmup[setNumber]; defR = template.defaultWarmupReps?.[setNumber];
  } else if (kind === "work" && template.defaultWork) {
    defW = template.defaultWork[setNumber - 1]; defR = template.defaultWorkReps?.[setNumber - 1];
  }
  if (last) {
    set.lastReps = parseInt(last.reps) || defR || null;
    set.lastBands = last.bands_json ? safeJSON(last.bands_json) : [];
    set.lastGrip = last.grip || fallbackGrip || null;
    const sum = set.lastBands.reduce((a, b) => a + b, 0), saved = last.weight_lb || 0;
    if (template.repsOnly) { /* reps only: saved weight (old bodyweight rows) is ignored */ }
    else if (template.assist) set.lastBodyweight = saved + sum;
    else set.lastWeight = template.bandAddon ? Math.max(0, saved - sum) : saved;
  } else {
    set.lastBands = [];
    if (fallbackGrip) set.lastGrip = fallbackGrip;
    if (defR) set.lastReps = defR;
    if (defW && !template.repsOnly) {
      if (template.assist) set.lastBodyweight = defW; else set.lastWeight = defW;
    }
  }
  if (template.repsOnly) {
    set.bands = [];
  } else if (template.assist) {
    set.bodyweight = loadBodyweight() || set.lastBodyweight || 175;
    set.bands = [...set.lastBands]; set.grip = set.lastGrip || template.grips?.[0] || template.stages?.[0]?.id || null;
  } else if (isBandOnly) {
    set.weight = 0; set.bands = [...set.lastBands]; set.bandsOnly = true;
  } else {
    const isB = template.equipment === "barbell" || template.name.includes("Barbell") || template.name === "Standing Overhead Press";
    set.weight = set.lastWeight || defW || (isB ? 45 : 0);
    set.bands = template.bandAddon ? [...set.lastBands] : [];
    if (template.grips) set.grip = set.lastGrip || template.grips[0];
  }
  return set;
}

const safeJSON = (s) => { try { return JSON.parse(s); } catch (_) { return []; } };

// Deload week: applied AFTER flattenTemplate so the normal prescription is
// computed first, then transformed. Warmups are kept (clamped to the single
// set's weight); all work sets collapse to ONE set at NORMAL reps and 80% of
// the top normal work weight, rounded UP to 5 lb. The kept set retains its
// setNumber so save/hydrate keys stay consistent across reload.
function applyDeloadPrescription(exercises) {
  const ceil5 = (w) => Math.ceil(w / 5) * 5;
  return exercises.map(ex => {
    const warmups = ex.sets.filter(s => s.kind === "warmup");
    const work = ex.sets.filter(s => s.kind === "work");
    if (!work.length) return ex;
    // Prefer a regular working set over the Pull-Ups UA single (setNumber 0)
    // so the rep target stays a normal set, not the 1-rep unassisted test.
    const basis = work.find(s => s.setNumber >= 1) || work[0];
    // lastWeight is overridden too: nav chips and rep strips preview "last"
    // values, and anchoring them at the heavy pre-deload numbers defeats the
    // point of the light week. Reps stay at the set's normal target.
    let single;
    if (ex.assist || ex.isBandsOnly || ex.repsOnly) {
      // Bodyweight (Pull-Ups, Dips, ...), band-only and reps-only: 80% isn't
      // selectable — one set exactly like the normal first set.
      single = { ...basis, idx: 1, deloadNormal: { weight: null, sets: work.length } };
    } else {
      const maxW = Math.max(...work.map(s => s.weight || 0));
      let w = ceil5(maxW * 0.8);
      if (ex.isBarbell) w = Math.max(45, w);
      // Keep the pre-deload prescription visible in the UI: lastWeight is
      // overridden below, so this is the only place the normal numbers survive.
      single = { ...basis, idx: 1, weight: w, lastWeight: w, bands: [], lastBands: [],
        deloadNormal: { weight: maxW, sets: work.length } };
    }
    const cappedWarmups = (ex.assist || ex.isBandsOnly || ex.repsOnly) ? warmups
      : warmups.map(s => (s.weight || 0) > (single.weight || 0) ? { ...s, weight: single.weight, lastWeight: single.weight } : s);
    return { ...ex, deload: true, sets: [...cappedWarmups, single] };
  });
}

function transitionActiveSetAfterLog(prev, eIdx, sIdx) {
  const cur = prev[eIdx];
  if (cur.superset) {
    const partnerIdx = prev.findIndex((e2, j) => j !== eIdx && e2.superset === cur.superset);
    const partnerNext = partnerIdx !== -1 ? prev[partnerIdx].sets.findIndex(s => !s.completed) : -1;
    if (partnerNext !== -1) {
      return prev.map((e, i) => i === eIdx ? { ...e, sets: e.sets.map((s, j) => j === sIdx ? { ...s, active: false } : s) } : i === partnerIdx ? { ...e, sets: e.sets.map((s, j) => j === partnerNext ? { ...s, active: true } : s) } : e);
    }
  }
  const sameExNext = cur.sets.findIndex((s, k) => k > sIdx && !s.completed);
  if (sameExNext !== -1) {
    return prev.map((e, i) => i !== eIdx ? e : ({ ...e, sets: e.sets.map((s, j) => j === sIdx ? { ...s, active: false } : j === sameExNext ? { ...s, active: true } : s) }));
  }
  const nextExIdx = prev.findIndex((e, k) => k > eIdx && e.sets.some(s => !s.completed));
  return prev.map((e, i) => {
    if (i === eIdx) return { ...e, sets: e.sets.map((s, j) => j === sIdx ? { ...s, active: false } : s) };
    if (i === nextExIdx) {
      const firstUndone = e.sets.findIndex(s => !s.completed);
      return firstUndone === -1 ? e : { ...e, sets: e.sets.map((s, j) => j === firstUndone ? { ...s, active: true } : s) };
    }
    return e;
  });
}

// Planned prescriptions: a plan entry (settings.workout_plan) may carry
// concrete per-exercise targets — items: [{ name, add, sets: [{w, r}] }].
// Applied AFTER the deload transform so an explicit prescription always wins.
// Weighted exercises get weight+reps prefilled; reps-only sets (w == null)
// keep the exercise's weight source (hints) and just set the rep target.
// Items with add:true and no matching template exercise are appended to the
// session like a library-added exercise.
function applyPlanPrescription(exercises, entry) {
  const items = entry && Array.isArray(entry.items) ? entry.items : [];
  if (!items.length) return exercises;
  const byName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

  const applySetTargets = (set, ps, ex) => {
    const next = { ...set, completed: false, active: false, reps: null };
    if (ps.w != null && !ex.assist && !ex.isBandsOnly && !ex.repsOnly) {
      next.weight = ps.w;
      next.lastWeight = ps.w;
      next.bands = [];
      next.lastBands = [];
    }
    if (ps.r != null) next.lastReps = ps.r;
    return next;
  };

  const out = exercises.map(ex => {
    const item = items.find(it => !it.add && byName(it.name, ex.name));
    if (!item || !item.sets || !item.sets.length) return ex;
    const warmups = ex.sets.filter(s => s.kind === "warmup");
    const work = ex.sets.filter(s => s.kind === "work");
    const proto = work[work.length - 1] || {
      kind: "work", saveExerciseName: ex.name, completed: false, active: false,
      reps: null, bands: [], lastBands: [], weight: 0,
    };
    const firstNum = work.length && typeof work[0].setNumber === "number" ? work[0].setNumber : 1;
    const planned = item.sets.map((ps, i) => {
      const base = work[i] ? work[i] : { ...proto };
      return { ...applySetTargets(base, ps, ex), idx: i + 1, setNumber: firstNum + i };
    });
    return { ...ex, deload: false, sets: [...warmups, ...planned], planPrescribed: true };
  });

  items.filter(it => it.add && !exercises.some(ex => byName(ex.name, it.name))).forEach((it, k) => {
    if (!it.sets || !it.sets.length) return;
    const official = findExerciseConfig(it.name);
    const name = official ? official.name : it.name;
    const isAssist = official ? !!official.assist : false;
    const isBandOnly = official ? (official.equipment === "band" && !official.bandAddon && !isAssist) : false;
    const template = {
      name,
      reps: official ? (official.reps || "8-12") : "8-12",
      notes: official ? (official.notes || "") : "Planned exercise.",
      equipment: official ? (official.equipment || null) : null,
      assist: isAssist,
      repsOnly: official ? !!official.repsOnly : false,
      bandAddon: official ? !!official.bandAddon : false,
      grips: official ? (official.grips || null) : null,
      stages: official ? (official.stages || null) : null,
      rest: official ? (official.rest || 60) : 60,
    };
    const exShell = {
      id: `plan-${name}`,
      templateExIdx: exercises.length + k,
      name,
      mode: isAssist ? "bodyweight" : undefined,
      superset: null,
      supersetPos: null,
      repRange: template.reps,
      note: template.notes,
      rest: template.rest,
      grips: template.grips ? template.grips.map(g => ({ id: g, ...GRIP_LABELS[g] })) : null,
      stages: template.stages,
      isBandsOnly: isBandOnly,
      bandAddon: template.bandAddon,
      assist: isAssist,
      repsOnly: template.repsOnly,
      isBarbell: template.equipment === "barbell" || name.includes("Barbell"),
      equipment: template.equipment,
      customAdded: true,
      planPrescribed: true,
    };
    const sets = it.sets.map((ps, i) => {
      const built = buildSet({
        kind: "work", idx: i + 1, template, last: null, setNumber: i + 1,
        saveExerciseName: name, isAssist, isBandOnly, fallbackGrip: null,
      });
      return applySetTargets(built, ps, exShell);
    });
    out.push({ ...exShell, sets });
  });
  return out;
}

export {
  flattenTemplate, buildSet, safeJSON, applyDeloadPrescription, transitionActiveSetAfterLog,
  applyPlanPrescription,
};
