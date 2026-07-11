"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { api } from "@/lib/db/api";
import { canApplyResolvedSessionId, selectScopedSaveTiming } from "@/lib/session-save-scope";
import {
  TEST_MODE, T, GRIP_LABELS, WORKOUTS, localDate, SWAP_GROUPS, isDeloadActive, planEntryForWorkout,
  estimateActiveWorkoutDuration,
} from "@/lib/legacy/shared";
import { applySwaps } from "@/lib/legacy/standards";
import {
  loadSwaps, saveSwaps, loadSkippedExercises, loadDeferred, applyDeferredOrder,
  loadSessionSets, serializeForSave, autoSavePayload, hydrateToday, activateNextSet,
} from "@/lib/legacy/session-persistence";
import { flattenTemplate, applyDeloadPrescription, applyPlanPrescription, computeSessionTimes } from "@/lib/legacy/session-utils";
import "./icons";
import { useWorkoutTimers } from "./useWorkoutTimers";
import { useWorkoutActions } from "./useWorkoutActions";
import { Header } from "./Header";
import { ExerciseNav } from "./ExerciseNav";
import { WorkoutCompleteScreen } from "./WorkoutCompleteScreen";
import { ExerciseCard } from "./ExerciseCard";
import { ExerciseCardV2 } from "./ExerciseCardV2";
import { StatsPane } from "./StatsPane";
import { DurationReadout } from "./DurationReadout";
import { buildExerciseDurationHistory, estimateExerciseDurationMeta } from "@/lib/legacy/duration-estimates";

// ─── file: workout-session-app.js ───

function App({ cardVariant = "v1", homeHref = "/" }) { const [workoutId, setWorkoutId] = useState(() => { const fromUrl = new URLSearchParams(window.location.search).get("w");
    return (fromUrl && WORKOUTS.some(w => w.id === fromUrl)) ? fromUrl : (WORKOUTS.find(w => w.main) || WORKOUTS[0]).id; });
  const workout = useMemo(() => WORKOUTS.find(w => w.id === workoutId) || WORKOUTS[0], [workoutId]);
  const onPickWorkout = (id) => { if (id === workoutId) return;
    const url = new URL(window.location.href); url.searchParams.set("w", id);
    window.history.replaceState({}, "", url);
    setLoaded(false); setExercises([]); setSessionId(null); setHistory([]); setStatHistory([]); setSwaps({});
    setSessionDate(localDate()); setFocused(null); resetTimers(id);
    setWorkoutId(id); };
  const [exercises, setExercises] = useState([]);
  const [sessionDate, setSessionDate] = useState(() => localDate());
  const [loaded, setLoaded] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [focused, setFocused] = useState(null);
  const { elapsed, startedAt, rest, setElapsed, setStartedAt, setRest, startTimer, restAdd, restSkip, restToggle, resetTimers } = useWorkoutTimers(workoutId, exercises);
  const [history, setHistory] = useState([]);
  const [statHistory, setStatHistory] = useState({});
  const [swaps, setSwaps] = useState({});
  const dataRef = useRef({ last: {}, hints: {} });
  useEffect(() => { let cancelled = false;
    // settings goes first: it's the cheapest query but gates deload/bodyweight,
    // and a single-threaded dev server processes requests in arrival order —
    // listed last it queues behind the heavy queries and can hit fetchT's timeout.
    (async () => { try { const results = await Promise.allSettled([ api.settings(), api.lastSession(workout.name), api.todaySession(workout.name), api.hints(), api.history(100), api.history1RM() ]);
        if (cancelled) return;
        const last = results[1].status === "fulfilled" ? results[1].value : {};
        const today = results[2].status === "fulfilled" ? results[2].value : null;
        const hints = results[3].status === "fulfilled" ? results[3].value : {};
        setHistory(results[4].status === "fulfilled" ? results[4].value || [] : []);
        setStatHistory(results[5].status === "fulfilled" ? results[5].value || {} : {});
        const settings = results[0].status === "fulfilled" ? results[0].value : null;
        if (settings) {
          window.USER_SETTINGS = settings;
        }
        // Deload status is frozen per session: an existing today-session's
        // saved state wins over the current toggle, so flipping the toggle at
        // home mid-workout doesn't mutate an in-flight session. A saved
        // session with no deload marker (predates the feature, or saved by
        // old code) was started normal — treat missing key as false.
        let deload = isDeloadActive(settings);
        if (today && today.state_json) {
          try {
            deload = !!JSON.parse(today.state_json).deload;
          } catch (e) { /* parse error already logged below */ }
        } else if (today) {
          deload = !!today.is_deload;
        }
        window.SESSION_DELOAD = deload;
        dataRef.current = { last: last || {}, hints: hints || {} };
        const activeDate = (today && today.date) ? today.date : localDate();
        setSessionDate(activeDate);
        if (today && today.state_json) {
          try {
            window.setSessionStateCache(workout.name, activeDate, JSON.parse(today.state_json));
          } catch (e) {
            console.error("[V2] failed to parse state_json:", e);
          }
        }
        const swapMap = loadSwaps(workout.name, activeDate);
        let hasNewSwap = false; if (today && today.sets) { today.sets.forEach(set => { if (set.exercise === "Barbell Back Squat" && !swapMap["0"]) { swapMap["0"] = "Barbell Back Squat";
              hasNewSwap = true; }
            if (set.exercise === "Dips" && !swapMap["5-0"]) { swapMap["5-0"] = "Dips";
              hasNewSwap = true; } }); }
        if (hasNewSwap) saveSwaps(workout.name, activeDate, swapMap);
        setSwaps(swapMap); let exs = flattenTemplate(applySwaps(workout, swapMap), last || {}, hints || {});
        if (window.SESSION_DELOAD) exs = applyDeloadPrescription(exs);
        // Planned prescriptions (concrete weights/reps/extra exercises from
        // the plan queue) win over both hints and the deload transform.
        exs = applyPlanPrescription(exs, planEntryForWorkout(workout.name));
        const savedSetsMap = loadSessionSets(workout.name, activeDate);
        if (savedSetsMap && Object.keys(savedSetsMap).length) {
          const templateNames = new Set(exs.map(ex => ex.name));
          exs = exs.map(ex => {
            const saved = savedSetsMap[ex.name];
            if (saved && saved.length) {
              const savedWarmups = saved.filter(s => s.kind === "warmup");
              const savedWorking = saved.filter(s => s.kind === "work");

              const templateWarmups = ex.sets.filter(s => s.kind === "warmup");
              const templateWorking = ex.sets.filter(s => s.kind === "work");

              const mergedWarmups = [];
              const maxWarmups = savedWarmups.length;
              for (let i = 0; i < maxWarmups; i++) {
                const ts = templateWarmups[i];
                const ss = savedWarmups[i];
                if (ts) {
                  mergedWarmups.push(ss ? { ...ts, ...ss, kind: ts.kind, setNumber: ts.setNumber, idx: ts.idx } : ts);
                } else {
                  mergedWarmups.push(ss);
                }
              }
              // Template gained warmups since this session was saved: append
              // them. Safe to distinguish from "user removed warmups" because
              // removal is all-or-nothing (onRemoveWarmup leaves zero saved).
              if (savedWarmups.length > 0) {
                for (let i = savedWarmups.length; i < templateWarmups.length; i++) {
                  mergedWarmups.push(templateWarmups[i]);
                }
              }

              const mergedWorking = [];
              const maxWorking = savedWorking.length;
              for (let i = 0; i < maxWorking; i++) {
                const ts = templateWorking[i];
                const ss = savedWorking[i];
                if (ts) {
                  mergedWorking.push(ss ? { ...ts, ...ss, kind: ts.kind, setNumber: ts.setNumber, idx: ts.idx } : ts);
                } else {
                  mergedWorking.push(ss);
                }
              }

              return { ...ex, sets: [...mergedWarmups, ...mergedWorking] };
            }
            return ex;
          });

          // Restore any custom added library exercises
          Object.keys(savedSetsMap).forEach(name => {
            if (!templateNames.has(name)) {
              const saved = savedSetsMap[name];
              if (saved && saved.some(s => s.completed)) {
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
                const isAssist = official ? !!official.assist : false;
                const isBandOnly = official ? (official.equipment === "band" && !official.bandAddon && !isAssist && !official.repsOnly) : (name.toLowerCase().includes("band") && !isAssist);
                
                exs.push({
                  id: `custom-${name}`,
                  name,
                  mode: isAssist ? "bodyweight" : undefined,
                  superset: null,
                  supersetPos: null,
                  repRange: official ? official.reps : "8-12",
                  note: official ? (official.notes || "") : "",
                  rest: official ? (official.rest || 60) : 60,
                  grips: official && official.grips ? official.grips.map(g => ({ id: g, ...GRIP_LABELS[g] })) : null,
                  stages: official ? (official.stages || null) : null,
                  isBandsOnly: isBandOnly,
                  bandAddon: official ? !!official.bandAddon : false,
                  assist: isAssist,
                  repsOnly: official ? !!official.repsOnly : false,
                  isBarbell: official ? (official.equipment === "barbell" || official.name.includes("Barbell") || official.name === "Standing Overhead Press") : (name.toLowerCase().includes("barbell")),
                  equipment: official ? (official.equipment || null) : null,
                  sets: saved,
                  customAdded: true,
                });
              }
            }
          });
        } if (today && today.id) { exs = hydrateToday(exs, today.sets || []);
          setSessionId(today.id); if (today.started_at) { const startedMs = Date.parse(today.started_at);
            if (!isNaN(startedMs)) setStartedAt(startedMs); }
          setElapsed(today.duration_sec || 0);
        } else { if (exs.length && exs[0].sets.length) exs[0].sets[0].active = true; }
        const skippedNames = loadSkippedExercises(workout.name, activeDate);
        if (skippedNames.size) { exs = exs.map(e => skippedNames.has(e.name) ? { ...e, skipped: true } : e); }
        const deferredNames = loadDeferred(workout.name, activeDate);
        if (deferredNames.length) exs = applyDeferredOrder(exs, deferredNames);
        if (skippedNames.size || deferredNames.length) activateNextSet(exs);
        setExercises(exs); setLoaded(true);
      } catch (e) { console.error("[V2] mount failed:", e);
        setLoaded(true); } })(); return () => { cancelled = true; };
  }, [workout, setElapsed, setStartedAt]);
  const startedAtRef = useRef(startedAt);
  const elapsedRef = useRef(elapsed);
  const saveScopeRef = useRef(`${workout.name}:${sessionDate}`);
  useEffect(() => {
    startedAtRef.current = startedAt;
    elapsedRef.current = elapsed;
    saveScopeRef.current = `${workout.name}:${sessionDate}`;
  }, [startedAt, elapsed, workout.name, sessionDate]);
  const saveDebounceRef = useRef(null);
  const queueSave = (currentExercises, currentSessionId, currentStartedAt, currentElapsed) => { clearTimeout(saveDebounceRef.current);
    const saveScope = `${workout.name}:${sessionDate}`;
    saveDebounceRef.current = setTimeout(() => {
      const timing = selectScopedSaveTiming(
        saveScope,
        saveScopeRef.current,
        { startedAt: currentStartedAt, elapsed: currentElapsed },
        { startedAt: startedAtRef.current, elapsed: elapsedRef.current },
      );
      const latestStartedAt = timing.startedAt;
      const latestElapsed = timing.elapsed;
      const payload = serializeForSave(currentExercises, workout.name, currentSessionId, latestStartedAt, latestElapsed, sessionDate);
      if (payload.sets.length === 0 && !latestStartedAt && !currentSessionId) return;
      autoSavePayload(payload, (newId) => {
        if (canApplyResolvedSessionId(saveScope, saveScopeRef.current, currentSessionId, newId)) setSessionId(newId);
      });
    }, 400); };
  const actions = useWorkoutActions({ workout, exercises, setExercises, sessionDate, sessionId, setSessionId, startedAt, elapsed, swaps, setSwaps, dataRef, startTimer, setRest, queueSave });
  const currentIdx = (() => { let i = exercises.findIndex(e => !e.skipped && e.sets.some(s => s.active));
    if (i !== -1) return i;
    i = exercises.findIndex(e => !e.skipped && e.sets.some(s => !s.completed));
    if (i !== -1) return i;
    return exercises.length - 1; })();
  const focusIdx = focused?.currentIdx === currentIdx ? focused.idx : null;
  const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = exercises.reduce((n, e) => e.skipped ? n + e.sets.length : n + e.sets.filter(s => s.completed).length, 0);
  const isFinished = totalSets > 0 && doneSets === totalSets;
  const durationHistory = useMemo(
    () => buildExerciseDurationHistory(history, { excludeSessionId: sessionId }),
    [history, sessionId],
  );
  const onSelectExercise = (idx) => { setFocused(idx == null ? null : { idx, currentIdx });
    const ex = exercises[idx]; if (!ex || ex.skipped) return;
    const hasActiveHere = ex.sets.some(s => s.active);
    const firstIncomplete = ex.sets.findIndex(s => !s.completed);
    if (!hasActiveHere && firstIncomplete !== -1) { const next = exercises.map((e) => ({ ...e, sets: e.sets.map(s => s.active ? { ...s, active: false } : s), }));
      next[idx] = { ...next[idx], sets: next[idx].sets.map((s, j) => j === firstIncomplete ? { ...s, active: true } : s), };
      actions.onPickWeight(idx, firstIncomplete, next[idx].sets[firstIncomplete].weight, next); } };
  const onSelectSet = (exIdx, setIdx) => { setFocused({ idx: exIdx, currentIdx });
    const ex = exercises[exIdx]; if (!ex || ex.skipped) return;
    const next = exercises.map((e, idx) => idx !== exIdx ? { ...e, sets: e.sets.map(s => s.active ? { ...s, active: false } : s) } : { ...e, sets: e.sets.map((s, j) => ({ ...s, active: j === setIdx })), });
    const selectedSet = next[exIdx].sets[setIdx];
    actions.onPickWeight(exIdx, setIdx, selectedSet.weight || selectedSet.lastWeight || 0, next); };
  if (!loaded) { return ( <div style={{ height: "100%", overflowY: "auto" }}>
        <div style={{ maxWidth: 448, margin: "0 auto", minHeight: "100%", background: T.page }}>
          <Header workout={workout} workouts={WORKOUTS} onPickWorkout={onPickWorkout} done={0} total={0} elapsedSec={0} deload={!!window.SESSION_DELOAD} homeHref={homeHref} />
          <div style={{ margin: "40px 16px", padding: "20px", textAlign: "center", color: T.muted, fontFamily: T.mono, fontSize: 13, border: `1px dashed ${T.cardBorder}`, borderRadius: 12 }}>
            loading workout…
          </div>
        </div>
      </div> ); }
  const shownIdx = (focusIdx != null && exercises[focusIdx]) ? focusIdx : (isFinished ? null : currentIdx);
  const shownExercise = shownIdx !== null ? exercises[shownIdx] : null;
  const currentTimeMs = startedAt ? startedAt + elapsed * 1000 : null;
  const sessionTimes = computeSessionTimes(exercises, startedAt, isFinished ? null : currentIdx, currentTimeMs);
  const exerciseDurationMeta = exercises.map((exercise, index) => estimateExerciseDurationMeta(
    exercise,
    durationHistory[exercise.name] || [],
    sessionTimes.byExercise[index] || 0,
  ));
  const plannedWorkoutSec = estimateActiveWorkoutDuration(exercises);
  const plannedExerciseSec = exerciseDurationMeta.reduce((sum, meta) => sum + meta.plannedSec, 0);
  const expectedExerciseSec = exerciseDurationMeta.reduce((sum, meta) => sum + meta.estimatedSec, 0);
  const historyExerciseCount = exerciseDurationMeta.filter((meta) => meta.sampleCount > 0).length;
  const expectedWorkoutBase = plannedExerciseSec > 0
    ? plannedWorkoutSec * (expectedExerciseSec / plannedExerciseSec)
    : plannedWorkoutSec;
  const expectedWorkoutSec = isFinished && elapsed > 0
    ? elapsed
    : Math.max(elapsed, Math.round(expectedWorkoutBase / 15) * 15);
  const workoutDurationMeta = {
    plannedSec: plannedWorkoutSec,
    estimatedSec: expectedWorkoutSec,
    actualSec: elapsed,
    sampleCount: 0,
    historyExerciseCount,
    source: isFinished && elapsed > 0 ? "actual" : elapsed > 0 ? "live" : historyExerciseCount ? "history" : "plan",
    complete: isFinished,
  };
  const ExerciseCardComponent = cardVariant === "v2" ? ExerciseCardV2 : ExerciseCard;
  const nav = (variant) => ( <ExerciseNav
      exercises={exercises}
      durationMeta={exerciseDurationMeta}
      shownIdx={shownIdx}
      currentIdx={currentIdx}
      onSelect={onSelectExercise}
      onSelectSet={onSelectSet}
      onSwapExercise={actions.onSwapExercise}
      onAddExercise={actions.onAddExercise}
      variant={variant}
      isFinished={isFinished} /> );
  return ( <div style={{ height: "100%", overflowY: "auto", background: T.page }}>
      {TEST_MODE && ( <div style={{ position: "sticky", top: 0, zIndex: 9000, background: "#F59E0B", color: "#1A1A1A", textAlign: "center", fontFamily: T.mono, fontWeight: 800, fontSize: 12, letterSpacing: 1, padding: "6px 10px" }}>
          ⚠ TEST MODE — nothing is being saved
        </div>
      )}
      <div className={`session-shell${cardVariant === "v2" ? " session-shell-v2" : ""}`}>
        <aside className="exercise-nav-pane">
          {nav("list")}
        </aside>
        <div className="session-main">
          <Header
            workout={workout}
            workouts={WORKOUTS}
            onPickWorkout={onPickWorkout}
            done={doneSets}
            total={totalSets}
            elapsedSec={elapsed}
            durationMeta={workoutDurationMeta}
            deload={!!window.SESSION_DELOAD}
            homeHref={homeHref} />
          <div className="exercise-nav-strip">
            {nav("strip")}
          </div>
          {(() => { const pe = planEntryForWorkout(workout.name);
            return pe && pe.note ? ( <div style={{ margin: "10px 16px 2px", padding: "9px 12px", borderRadius: 12, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", color: T.text, fontSize: 12.5, lineHeight: 1.45 }}>
                <span style={{ color: T.accentLight, fontFamily: T.mono, fontSize: 10, fontWeight: 800, letterSpacing: 1, display: "block", marginBottom: 2 }}>📋 PLAN NOTE</span>
                {pe.note}
              </div> ) : null; })()}
          {shownIdx === null && isFinished ? ( <WorkoutCompleteScreen
              workoutName={workout.name}
              elapsedSec={elapsed}
              totalSets={totalSets}
              exercises={exercises}
              sessionDate={sessionDate}
              onFinish={() => actions.onFinishWorkout(elapsed)} />
          ) : shownExercise && (() => { const i = shownIdx;
            const ex = shownExercise; const group = ex.superset ? exercises.map((e2, idx) => ({ e: e2, idx })).filter(g => !g.e.skipped && g.e.superset === ex.superset) : [];
            const combined = group.length > 1;
            const posInGroup = combined ? group.findIndex(g => g.idx === i) + 1 : null;
            const supersetTag = ex.superset ? `${ex.superset}${ex.supersetPos || posInGroup || ''}` : null;
            const card = ( <ExerciseCardComponent exercise={ex}
                sessionTimes={sessionTimes}
                durationMeta={exerciseDurationMeta[i]}
                supersetTag={supersetTag}
                embedded={combined}
                rest={rest}
                onRestAdd={restAdd}
                onRestSkip={restSkip}
                onRestToggle={restToggle}
                onPickWeight={(sIdx, w) => actions.onPickWeight(i, sIdx, w)}
                onPickBodyweight={(sIdx, w) => actions.onPickBodyweight(i, sIdx, w)}
                onPickGrip={(sIdx, g) => actions.onPickGrip(i, sIdx, g)}
                onToggleBand={(sIdx, b) => actions.onToggleBand(i, sIdx, b)}
                onClearBands={(sIdx) => actions.onClearBands(i, sIdx)}
                onLogReps={(sIdx, r) => actions.onLogReps(i, sIdx, r)}
                onSkipWarmup={() => actions.onSkipWarmup(i)}
                onSkipExercise={() => actions.onSkipExercise(i)}
                onDeferExercise={() => actions.onDeferExercise(i)}
                onSwapExercise={(newName) => actions.onSwapExercise(i, newName)}
                onReopenSet={(sIdx) => actions.onReopenSet(i, sIdx)}
                onAddSet={() => actions.onAddSet(i)}
                onRemoveSet={() => actions.onRemoveSet(i)}
                onRemoveWarmup={() => actions.onRemoveWarmup(i)} /> );
            if (!combined) { return ( <React.Fragment key={ex.id}>
                  {ex.superset && ( <div style={{ margin: "4px 16px 6px", display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 1, background: "rgba(192,132,252,0.18)" }} />
                      <span style={{ color: T.bands, fontFamily: T.mono, fontSize: 10, fontWeight: 800, letterSpacing: 1.2 }}>
                        SUPERSET {ex.superset}
                      </span>
                      <div style={{ flex: 1, height: 1, background: "rgba(192,132,252,0.18)" }} />
                    </div>
                  )}
                  {card}
                </React.Fragment> ); }
            const working = m => m.e.sets.filter(s => s.kind !== "warmup");
            const roundsTotal = Math.min(...group.map(m => working(m).length));
            const completedRounds = Math.min(...group.map(m => working(m).filter(s => s.completed).length));
            const currentRound = Math.min(completedRounds + 1, roundsTotal);
            const doneGroupSets = group.reduce((n, m) => n + m.e.sets.filter(s => s.completed).length, 0);
            const totalGroupSets = group.reduce((n, m) => n + m.e.sets.length, 0);
            const extras = group.map(m => ({ m, extra: working(m).length - roundsTotal })).filter(x => x.extra > 0);
            const activeSet = ex.sets.find(s => s.active);
            const isWarmupStep = activeSet && activeSet.kind === "warmup";
            const nextPartner = group.find(g => g.idx !== i && g.idx > i && g.e.sets.some(s => !s.completed));
            const firstWithWork = group.find(g => g.e.sets.some(s => !s.completed));
            const fmtLast = (m) => { const done = m.e.sets.filter(s => s.completed && s.reps);
              const s = done[done.length - 1];
              if (!s) return null;
              const bandSum = (s.bands || []).reduce((a, b) => a + b, 0);
              if (m.e.repsOnly) return `${s.reps} reps`;
              let w; if (m.e.assist) w = bandSum ? `BW −${bandSum}` : "BW";
              else if (m.e.isBandsOnly) w = bandSum ? `${bandSum} lb band` : "band";
              else w = `${s.weight || 0} lb`;
              return `${w} × ${s.reps}`; }; const dots = Array.from({ length: roundsTotal }, (_, r) => { const c = r < completedRounds ? T.green : (r === completedRounds && completedRounds < roundsTotal) ? T.accentLight : "rgba(255,255,255,0.12)";
              return <span key={r} style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />; });
            const divider = "1px solid rgba(255,255,255,0.05)";
            return ( <React.Fragment key={ex.id}>
                <div style={{ margin: "0 16px 12px", background: T.cardBg, border: "1px solid rgba(192,132,252,0.25)", borderRadius: 14, overflow: "hidden", }}>
                  <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, background: "rgba(192,132,252,0.06)" }}>
                    <span style={{ color: T.bands, fontFamily: T.mono, fontSize: 10, fontWeight: 800, letterSpacing: 1.2 }}>
                      ⇄ SUPERSET {ex.superset}
                    </span>
                    <span style={{ color: T.text, fontSize: 12, fontWeight: 700 }}>
                      · {isWarmupStep ? "Warm-up" : `Round ${currentRound} of ${roundsTotal}`}
                    </span>
                    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {dots}
                      <span style={{ color: T.faint, fontFamily: T.mono, fontSize: 10, marginLeft: 4 }}>{doneGroupSets}/{totalGroupSets}</span>
                    </span>
                  </div>
                  {extras.length > 0 && ( <div style={{ padding: "6px 14px 0", color: T.faint, fontFamily: T.mono, fontSize: 10 }}>
                      {extras.map(x => `+${x.extra} solo ${x.m.e.name} set${x.extra > 1 ? "s" : ""} at the end`).join(" · ")}
                    </div>
                  )}
                  {group.map((m, k) => { const tag = `${ex.superset}${k + 1}`;
                    if (m.idx === i) { return ( <div key={m.idx} style={{ padding: "12px 14px 14px", borderTop: k > 0 ? divider : "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: T.bands, fontFamily: T.mono, fontSize: 11, fontWeight: 800, letterSpacing: 1, padding: "2px 6px", borderRadius: 5, background: "rgba(192,132,252,0.12)", flexShrink: 0, }}>{tag}</span>
                            <div style={{ minWidth: 0 }}>
                              <h2 style={{ margin: 0, color: T.strong, fontSize: 18, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.3 }}>{m.e.name}</h2>
                              <DurationReadout meta={exerciseDurationMeta[m.idx]} variant="nav" />
                            </div>
                          </div>
                          {m.e.note && ( <p style={{ margin: "5px 0 0", color: T.muted, fontSize: 12, lineHeight: 1.4 }}>{m.e.note}</p>
                          )}
                          {card}
                        </div> ); }
                    const total = m.e.sets.length;
                    const done = m.e.sets.filter(s => s.completed).length;
                    const allDone = done === total;
                    const last = fmtLast(m); return ( <div key={m.idx} onClick={() => onSelectExercise(m.idx)} style={{ padding: "10px 14px", borderTop: k > 0 ? divider : "none", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", opacity: allDone ? 0.55 : 1, }}>
                        <span style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: T.mono, fontSize: 10, fontWeight: 800, background: allDone ? "rgba(52,211,153,0.15)" : "rgba(192,132,252,0.15)", color: allDone ? T.green : T.bands, }}>{allDone ? "✓" : tag}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: T.text, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.e.name}</div>
                          <div style={{ color: T.faint, fontFamily: T.mono, fontSize: 11 }}>
                            {done}/{total} sets{last ? ` · last ${last}` : ""}
                          </div>
                          <DurationReadout meta={exerciseDurationMeta[m.idx]} variant="nav" />
                        </div>
                        <span style={{ color: T.faint, fontFamily: T.mono, fontSize: 10, flexShrink: 0 }}>{allDone ? "edit" : "open →"}</span>
                      </div> );
                  })}
                  <div style={{ padding: "9px 14px", borderTop: divider, background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {nextPartner ? ( <React.Fragment>
                        <span style={{ color: T.amber, fontFamily: T.mono, fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>NO REST</span>
                        <span style={{ color: T.faint, fontSize: 11 }}>— log this set, then go straight to {nextPartner.e.name}</span>
                      </React.Fragment>
                    ) : ( <span style={{ color: T.faint, fontSize: 11 }}>
                        after this set: {ex.rest || 60}s round rest{firstWithWork && firstWithWork.idx !== i ? ` → back to ${firstWithWork.e.name}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              </React.Fragment> );
          })()}
        </div>
        <aside className="stats-pane-wrap">
          <StatsPane
            exercise={shownExercise}
            history={history}
            statHistory={statHistory}
            exercises={exercises} />
        </aside>
      </div>
    </div> ); }

export default App;
