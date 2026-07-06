"use client";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/db/api";
import {
  TEST_MODE, LS_PREFIX, T, GRIP_LABELS, WORKOUTS, localDate, SWAP_GROUPS,
  getSwapGroup, getSwapGroupName, estimateExerciseDuration,
  estimateTemplateWorkoutDuration, isDeloadActive, stageRank, stageLabel,
} from "@/lib/legacy/shared";
import {
  EXERCISE_MUSCLES, getMuscleImpact, calcSet1RM, decodeStageScore, applySwaps,
} from "@/lib/legacy/standards";
import {
  setSessionStateCache, loadSwaps, saveSwaps, loadSkippedExercises, saveSkippedExercises,
  loadDeferred, saveDeferred, applyDeferredOrder, loadBodyweight, saveBodyweight,
  loadSessionSets, saveSessionSets, serializeForSave, autoSavePayload,
  hydrateToday, activateNextSet,
} from "@/lib/legacy/session-persistence";
import {
  flattenTemplate, applyDeloadPrescription, transitionActiveSetAfterLog,
} from "@/lib/legacy/session-utils";

// ─── file: workout-session-icons.js ───

(function() {
  if (typeof window === "undefined") return;
  const base = "https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/";
  
  const gifMap = {
    // Core Exercises
    "Pull-Ups": "lats/assisted-pull-up.gif",
    "Band Bicep Curls": "biceps/band-alternating-biceps-curl.gif",
    "Band Romanian Deadlift": "glutes/dumbbell-romanian-deadlift.gif",
    "Band Row": "upper-back/band-one-arm-standing-low-row.gif",
    "Band Squat": "glutes/band-squat.gif",
    "Band Torso Rotation": "abs/band-horizontal-pallof-press.gif",
    "Cable Tricep Pushdowns": "triceps/cable-pushdown.gif",
    "Band Tricep Pushdowns": "triceps/cable-pushdown.gif",
    "Barbell Back Squat": "glutes/barbell-full-squat.gif",
    "Barbell Bench Press": "pectorals/barbell-bench-press.gif",
    "Barbell RDL": "glutes/barbell-romanian-deadlift.gif",
    "Barbell Shrugs": "traps/barbell-shrug.gif",
    "Bent-Over Barbell Rows": "upper-back/barbell-bent-over-row.gif",
    "Bulgarian Split Squat": "quads/dumbbell-single-leg-split-squat.gif",
    "Cable Torso Rotation": "abs/cable-twist.gif",
    "Calf Raises": "calves/barbell-standing-calf-raise.gif",
    "Dips": "triceps/weighted-tricep-dips.gif",
    "Dumbbell Bent-Over Rows": "upper-back/dumbbell-bent-over-row.gif",
    "Dumbbell Bicep Curls": "biceps/dumbbell-alternate-biceps-curl.gif",
    "Dumbbell Flat Bench Press": "pectorals/dumbbell-bench-press.gif",
    "Dumbbell Hammer Curls": "biceps/dumbbell-hammer-curl.gif",
    "Dumbbell Lateral Raises": "delts/dumbbell-lateral-raise.gif",
    "Dumbbell Romanian Deadlift": "glutes/dumbbell-romanian-deadlift.gif",
    "Dumbbell Shrugs": "traps/dumbbell-shrug.gif",
    "Cable Face Pulls": "delts/cable-standing-rear-delt-row-with-rope.gif",
    "Face Pulls": "delts/cable-standing-rear-delt-row-with-rope.gif",
    "Goblet Squat": "glutes/kettlebell-goblet-squat.gif",
    "Hanging Knee Raise": "abs/assisted-hanging-knee-raise-with-throw-down.gif",
    "Incline Barbell Press": "pectorals/barbell-incline-bench-press.gif",
    "Incline DB Curls": "biceps/dumbbell-incline-biceps-curl.gif",
    "Incline Dumbbell Press": "pectorals/dumbbell-incline-bench-press.gif",
    "Lunges": "glutes/dumbbell-lunge.gif",
    "Overhead Dumbbell Press": "delts/dumbbell-standing-overhead-press.gif",
    "Overhead Tricep Extension": "triceps/cable-high-pulley-overhead-tricep-extension.gif",
    "Pallof Press": "abs/band-horizontal-pallof-press.gif",
    "Reverse Flyes": "delts/dumbbell-reverse-fly.gif",
    "Seated Overhead Press": "delts/barbell-seated-overhead-press.gif",
    "Single-Arm Cable Lateral Raise": "delts/cable-lateral-raise.gif",
    "Single-Arm Dumbbell Rows": "upper-back/one-arm-dumbbell-row.gif",
    "Single-Leg DB RDL": "glutes/dumbbell-single-leg-deadlift.gif",
    "Standing Overhead Press": "delts/dumbbell-standing-overhead-press.gif"
  };

  const fallback = `
    <div style="display:flex;width:100%;height:100%;background:#0e1626;align-items:center;justify-content:center">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4b5563" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6.5 6.5 11 11"/>
        <path d="m11 6.5 6.5 6.5"/>
        <path d="m6.5 11 6.5 6.5"/>
      </svg>
    </div>
  `;

  window.getExerciseIcon = function(name) {
    const file = gifMap[name];
    if (!file) return fallback;
    
    return `
      <div style="display:flex;width:100%;height:100%;background:#090d16;align-items:center;justify-content:center;overflow:hidden">
        <img src="${base}${file}" style="width:100%;height:100%;object-fit:contain;display:block;background:#090d16" />
      </div>
    `;
  };
})();

// ─── file: workout-session-hooks.js ───

function useWorkoutTimers(workoutId, exercises) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [rest, setRest] = useState(null);  // { total, left, eIdx, sIdx, kind, paused }

  const lastInteractionRef = useRef(Date.now());
  const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

  // Reset/restore timer states when workoutId changes
  useEffect(() => {
    setElapsed(0);
    setRunning(false);
    setStartedAt(null);
    setRest(null);

    if (!workoutId) return;

    const savedRestRaw = localStorage.getItem(`${LS_PREFIX}v2-rest-timer:${workoutId}`);
    if (savedRestRaw) {
      try {
        const savedRest = JSON.parse(savedRestRaw);
        if (savedRest && (savedRest.paused || savedRest.endAt > Date.now())) {
          const left = savedRest.paused ? savedRest.left : Math.max(0, Math.ceil((savedRest.endAt - Date.now()) / 1000));
          if (left > 0) {
            setRest({ ...savedRest, left });
          }
        } else {
          localStorage.removeItem(`${LS_PREFIX}v2-rest-timer:${workoutId}`);
        }
      } catch (_) {}
    }
  }, [workoutId]);

  // Persist rest timer state to localStorage whenever it changes
  useEffect(() => {
    if (!workoutId) return;
    const key = `${LS_PREFIX}v2-rest-timer:${workoutId}`;
    if (rest) {
      localStorage.setItem(key, JSON.stringify(rest));
    } else {
      localStorage.removeItem(key);
    }
  }, [rest, workoutId]);

  // Elapsed timer based on wall time. Ticks every 1s when startedAt is set.
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  // Rest timer ticks every 1s while not paused and not finished.
  useEffect(() => {
    if (!rest || rest.paused || rest.left === 0) return;
    const id = setInterval(() => {
      setRest(r => {
        if (!r || r.paused || r.left === 0) return r;
        const left = Math.max(0, Math.ceil((r.endAt - Date.now()) / 1000));
        return { ...r, left };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [
    rest && rest.paused,
    rest && rest.left === 0,
    rest && rest.eIdx,
    rest && rest.sIdx,
    rest === null
  ]);

  // Immediately re-sync the rest timer when tab gains focus or screen turns on
  useEffect(() => {
    const resync = () => {
      setRest(r => {
        if (!r || r.paused || r.left === 0) return r;
        const left = Math.max(0, Math.ceil((r.endAt - Date.now()) / 1000));
        return { ...r, left };
      });
    };
    const onVisible = () => { if (!document.hidden) resync(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", resync);
    };
  }, []);

  // Migrate the rest timer to wherever the active set currently lives.
  useEffect(() => {
    if (!rest) return;
    const activeExIdx = exercises.findIndex(e => e.sets.some(s => s.active));
    if (activeExIdx === -1) return;
    if (activeExIdx === rest.eIdx) return;
    setRest(r => r ? { ...r, eIdx: activeExIdx } : r);
  }, [exercises, rest && rest.eIdx]);

  const startTimer = () => {
    lastInteractionRef.current = Date.now();
    if (!running) setRunning(true);
    if (!startedAt) {
      setStartedAt(Date.now() - (elapsed || 0) * 1000);
    }
  };

  const restAdd = (sec) => setRest(r => {
    if (!r) return r;
    const newLeft = Math.max(0, r.left + sec);
    const newTotal = Math.max(r.total, newLeft);
    const endAt = r.paused ? 0 : Date.now() + newLeft * 1000;
    return { ...r, left: newLeft, total: newTotal, endAt };
  });

  const restSkip = () => setRest(null);

  const restToggle = () => setRest(r => {
    if (!r) return r;
    const paused = !r.paused;
    const endAt = paused ? 0 : Date.now() + r.left * 1000;
    return { ...r, paused, endAt };
  });

  return {
    elapsed,
    running: startedAt !== null,
    startedAt,
    rest,
    setElapsed,
    setRunning: () => {},
    setStartedAt,
    setRest,
    startTimer,
    restAdd,
    restSkip,
    restToggle
  };
}

// ─── file: workout-session-header.js ───

function Header({ workout, workouts, onPickWorkout, done, total, elapsedSec, running, onToggleTimer, deload }) {
  const pct = total ? (done / total) * 100 : 0;
  const m = Math.floor(elapsedSec / 60);
  const s = String(elapsedSec % 60).padStart(2, "0");
  const [open, setOpen] = useState(false);
  const hasMultiple = (workouts || []).length > 1;

  useEffect(() => {
    if (!open || !hasMultiple) return;
    const onDoc = (e) => {
      if (!e.target.closest || !e.target.closest("[data-workout-menu]")) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open, hasMultiple]);

  return (
    <div style={{ background: T.page, padding: "14px 18px 14px", position: "sticky", top: 0, zIndex: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <a href="/" style={{ color: T.accent, fontSize: 16, fontWeight: 600, textDecoration: "none", flexShrink: 0 }} title="Home">← Back</a>
          <div data-workout-menu style={{ position: "relative", minWidth: 0 }}>
            <button onClick={hasMultiple ? () => setOpen(o => !o) : undefined} style={{
              background: "transparent", border: 0, color: T.strong,
              fontSize: 17, fontWeight: 700, letterSpacing: -0.3,
              padding: 0, cursor: hasMultiple ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6,
              maxWidth: "100%",
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workout.name}</span>
              {hasMultiple && <span style={{ color: T.faint, fontSize: 12, transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 160ms ease" }}>▾</span>}
            </button>
            {hasMultiple && open && (
              <div style={{
                position: "absolute", top: "100%", left: 0, marginTop: 6,
                background: "#0f1722", border: `1px solid ${T.cardBorder}`,
                borderRadius: 10, padding: 4, minWidth: 200, zIndex: 10,
                boxShadow: "0 10px 30px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
              }}>
                {workouts.map(w => {
                  const sel = w.id === workout.id;
                  return (
                    <button key={w.id} onClick={() => { setOpen(false); onPickWorkout(w.id); }} style={{
                      display: "block", width: "100%", textAlign: "left",
                      background: sel ? "rgba(59,130,246,0.12)" : "transparent",
                      border: 0,
                      color: sel ? T.accentLight : T.text,
                      fontSize: 14, fontWeight: sel ? 700 : 500,
                      padding: "9px 12px", borderRadius: 7, cursor: "pointer",
                    }}>
                      {w.name}
                      <span style={{ marginLeft: 8, color: T.faint, fontSize: 11, fontWeight: 500 }}>~{Math.round(estimateTemplateWorkoutDuration(w) / 60)} min</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {deload && (
            <span style={{
              color: "#fbbf24", background: "rgba(251,191,36,0.12)",
              border: "1px solid rgba(251,191,36,0.4)",
              fontFamily: T.mono, fontSize: 10, fontWeight: 800, letterSpacing: 1,
              padding: "2px 6px", borderRadius: 5, flexShrink: 0, whiteSpace: "nowrap",
            }}>DELOAD</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ color: T.faint, fontFamily: T.mono, fontSize: 12, fontWeight: 600 }}>{done}/{total}</span>
          {elapsedSec > 0 ? (
            <div
              style={{
                background: "rgba(52,211,153,0.12)",
                border: `1px solid rgba(52,211,153,0.45)`,
                color: T.green,
                fontFamily: T.mono, fontWeight: 700, fontSize: 13,
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 11px", borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 11 }}>⏱</span>
              <span>Active</span>
              <span style={{ opacity: 0.45 }}>·</span>
              <span style={{ letterSpacing: -0.3 }}>{m}:{s}</span>
            </div>
          ) : (
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${T.cardBorder}`,
                color: T.faint,
                fontFamily: T.mono, fontWeight: 700, fontSize: 13,
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 11px", borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 11 }}>▶</span>
              <span>Not Started</span>
              <span style={{ opacity: 0.45 }}>·</span>
              <span style={{ letterSpacing: -0.3 }}>0:00</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: T.accent, borderRadius: 99, transition: "width 240ms ease" }} />
      </div>
    </div>
  );
}

// ─── file: workout-session-warmup-callout.js ───

function WarmupCallout({ text }) {
  return (
    <div style={{
      margin: "10px 16px 12px",
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid rgba(217,119,6,0.3)",
      background: "rgba(217,119,6,0.04)",
      display: "flex", gap: 9, alignItems: "center",
    }}>
      <span style={{ fontSize: 13 }}>🔥</span>
      <div style={{ fontSize: 13, lineHeight: 1.35, color: T.amberMuted }}>
        <strong style={{ color: T.amber, fontWeight: 700 }}>Warm-up · </strong>
        {text}
      </div>
    </div>
  );
}

// ─── file: workout-session-stepper.js ───

function StepperBtn({ children, onClick, big, dim }) {
  const press = (e, val) => { e.currentTarget.style.transform = val; };
  return (
    <button
      onClick={onClick}
      onMouseDown={e => press(e, "scale(0.92)")}
      onMouseUp={e => press(e, "scale(1)")}
      onMouseLeave={e => press(e, "scale(1)")}
      onTouchStart={e => press(e, "scale(0.92)")}
      onTouchEnd={e => press(e, "scale(1)")}
      style={{
        width: big ? 52 : 40, height: big ? 52 : 40, borderRadius: 12,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: dim ? T.faint : "#D1D5DB",
        fontFamily: T.mono, fontWeight: 600, fontSize: big ? 22 : 14,
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, lineHeight: 1,
        transition: "transform 80ms ease, background 120ms ease",
      }}
    >{children}</button>
  );
}

function WeightStepper({ value, last, pr, onPick, label, isCable }) {
  const v = parseFloat(value ?? last ?? 0);
  const step = (delta) => onPick(Math.max(0, Math.round((v + delta) * 100) / 100));
  const atLast = last != null && parseFloat(v) === parseFloat(last);
  const diff = last != null ? v - last : 0;
  return (
    <div style={{ marginTop: 14 }}>
      {label && (
        <div style={{ marginBottom: 6, color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.6 }}>
          {label}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StepperBtn onClick={() => step(-5)} big>−</StepperBtn>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ color: T.strong, fontFamily: T.mono, fontSize: 36, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>{v}</span>
            <span style={{ color: T.faint, fontFamily: T.mono, fontSize: 14, fontWeight: 600 }}>lb</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: T.mono, fontSize: 11, color: T.faint }}>
            {last != null && (
              <button onClick={() => onPick(last)} style={{
                background: atLast ? "rgba(96,165,250,0.10)" : "transparent",
                border: atLast ? `1px solid rgba(96,165,250,0.3)` : "1px dashed rgba(255,255,255,0.1)",
                color: atLast ? T.accentLight : T.faint,
                fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                padding: "3px 7px", borderRadius: 5, cursor: "pointer",
              }}>LAST {last}</button>
            )}
            {!atLast && diff !== 0 && (
              <span style={{ color: diff > 0 ? T.green : T.red, fontWeight: 700 }}>
                {diff > 0 ? "+" : ""}{diff}
              </span>
            )}
            {pr != null && <span>· PR {pr}</span>}
          </div>
        </div>
        <StepperBtn onClick={() => step(5)} big>+</StepperBtn>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8 }}>
        <StepperBtn onClick={() => step(-2.5)} dim>−2.5</StepperBtn>
        {isCable && <StepperBtn onClick={() => step(-1.25)} dim>−1.25</StepperBtn>}
        {isCable && <StepperBtn onClick={() => step(1.25)} dim>+1.25</StepperBtn>}
        <StepperBtn onClick={() => step(2.5)} dim>+2.5</StepperBtn>
      </div>
    </div>
  );
}

function GripSelector({ grips, selected, last, onPick }) {
  if (!grips || grips.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.6 }}>GRIP</span>
        {last && last !== selected && (
          <button onClick={() => onPick(last)} style={{ background: "transparent", border: 0, color: T.accentLight, fontFamily: T.mono, fontSize: 11, fontWeight: 700, padding: 0, cursor: "pointer" }}>
            use last: {last}
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${grips.length}, 1fr)`, gap: 6 }}>
        {grips.map(g => {
          const sel = g.id === selected;
          const wasLast = g.id === last;
          return (
            <button key={g.id} onClick={() => onPick(g.id)} style={{
              position: "relative",
              background: sel ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.03)",
              border: sel ? `1px solid ${T.accentLight}` : "1px solid rgba(255,255,255,0.08)",
              color: sel ? "#DBEAFE" : T.muted,
              padding: "9px 4px 8px", borderRadius: 8, cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              transition: "all 120ms ease",
            }}>
              {wasLast && (
                <span style={{ position: "absolute", top: 4, left: 5, width: 5, height: 5, borderRadius: "50%", background: T.accentLight }} />
              )}
              <span style={{ fontSize: 13, fontWeight: 700 }}>{g.label}</span>
              <span style={{ fontSize: 9, color: sel ? T.muted : T.faint, fontFamily: T.mono, letterSpacing: 0.4, textTransform: "uppercase" }}>{g.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Ladder picker for staged (skill-progression) exercises. Ordered top = easiest.
// The chosen stage id is stored on the set's `grip` field, so it persists and
// prefills exactly like Pull-Up grips do.
function StageSelector({ stages, selected, last, onPick }) {
  if (!stages || stages.length === 0) return null;
  const selIdx = stages.findIndex(s => s.id === selected);
  const lastObj = stages.find(s => s.id === last);
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.6 }}>
          STAGE <span style={{ color: T.faint, fontWeight: 500 }}>· easiest → hardest</span>
        </span>
        {lastObj && last !== selected && (
          <button onClick={() => onPick(last)} style={{ background: "transparent", border: 0, color: T.accentLight, fontFamily: T.mono, fontSize: 11, fontWeight: 700, padding: 0, cursor: "pointer" }}>
            use last: {lastObj.label}
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {stages.map((st, i) => {
          const sel = st.id === selected;
          const wasLast = st.id === last;
          const conquered = selIdx > -1 && i < selIdx;
          return (
            <button key={st.id} onClick={() => onPick(st.id)} style={{
              position: "relative",
              display: "flex", alignItems: "center", gap: 10,
              background: sel ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.03)",
              border: sel ? `1px solid ${T.accentLight}` : "1px solid rgba(255,255,255,0.08)",
              padding: "8px 10px", borderRadius: 8, cursor: "pointer",
              opacity: sel ? 1 : conquered ? 0.55 : 0.9,
              transition: "all 120ms ease", textAlign: "left",
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: sel ? T.accent : conquered ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)",
                color: sel ? "#FFFFFF" : conquered ? T.green : T.faint,
                fontFamily: T.mono, fontSize: 11, fontWeight: 800,
              }}>{conquered ? "✓" : i + 1}</span>
              <span style={{ color: sel ? "#DBEAFE" : T.text, fontSize: 13.5, fontWeight: 700, flex: 1 }}>{st.label}</span>
              <span style={{ color: sel ? T.muted : T.faint, fontFamily: T.mono, fontSize: 9.5, letterSpacing: 0.4, textTransform: "uppercase" }}>{st.hint}</span>
              {wasLast && (
                <span style={{ position: "absolute", top: 5, left: 5, width: 5, height: 5, borderRadius: "50%", background: T.accentLight }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BandsGrid({ bands, lastBands, onToggle, onClear, isAssist }) {
  const total = bands.reduce((a, b) => a + b, 0);
  const showUseLast = lastBands.length > 0 && !(lastBands.length === bands.length && lastBands.every(b => bands.includes(b)));
  const bandValues = [5, 15, 20, 30, 35]; // yellow, green, red, blue, black

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.6 }}>
          {isAssist ? "ASSISTANCE" : "BANDS"} <span style={{ color: T.faint, fontWeight: 500 }}>· tap to add</span>
        </span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {showUseLast && (
            <button onClick={() => onToggle("__use_last__")} style={{ background: "transparent", border: 0, color: T.bands, fontFamily: T.mono, fontSize: 11, fontWeight: 700, padding: 0, cursor: "pointer" }}>
              use last: {lastBands.join("+")}
            </button>
          )}
          {bands.length > 0 && (
            <button onClick={onClear} style={{ background: "transparent", border: 0, color: T.faint, fontSize: 11, padding: 0, cursor: "pointer" }}>clear</button>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {bandValues.map(v => {
          const sel = bands.includes(v);
          const wasLast = lastBands.includes(v);
          return (
            <button key={v} onClick={() => onToggle(v)} style={{
              position: "relative",
              background: sel ? "rgba(192,132,252,0.18)" : "rgba(255,255,255,0.03)",
              border: sel ? `1px solid ${T.bands}` : "1px solid rgba(255,255,255,0.08)",
              color: sel ? T.bandsText : T.muted,
              fontFamily: T.mono, fontWeight: 700, fontSize: 13,
              padding: "9px 0", borderRadius: 8, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 120ms ease",
            }}>
              {wasLast && (
                <span style={{ position: "absolute", top: 4, left: 5, width: 5, height: 5, borderRadius: "50%", background: T.bands }} />
              )}
              {v}
            </button>
          );
        })}
      </div>
      {bands.length > 0 && (
        <div style={{ marginTop: 8, color: T.bands, fontFamily: T.mono, fontSize: 11, opacity: 0.85 }}>
          {bands.join(" + ")} = {isAssist ? "−" : "+"}{total}lb
        </div>
      )}
    </div>
  );
}

// ─── file: workout-session-repstrip.js ───

function RepCell({ n, inRange, isLast, isLogged, onClick }) {
  let bg = "transparent";
  let color = inRange ? "#D1D5DB" : T.faint;
  let border = "1px solid transparent";
  if (inRange) {
    bg = "rgba(34,197,94,0.05)";
    border = "1px solid rgba(34,197,94,0.18)";
  }
  if (isLast) {
    border = "1.5px solid rgba(34,197,94,0.55)";
    color = "#86EFAC";
  }
  if (isLogged) {
    bg = "#22C55E";
    border = "1px solid #22C55E";
    color = T.inv;
  }
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative", width: 38, height: 44, borderRadius: 9,
        background: bg, border, color,
        fontFamily: T.mono, fontWeight: isLogged || isLast ? 800 : 600, fontSize: 14,
        cursor: "pointer", flexShrink: 0,
        transition: "transform 80ms ease, background 120ms ease",
        animation: isLogged ? "set-pulse 320ms ease-out" : "none",
      }}
      onMouseDown={e => (e.currentTarget.style.transform = "scale(0.92)")}
      onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
    >
      {isLast && !isLogged && (
        <span style={{ position: "absolute", top: 4, left: 5, width: 5, height: 5, borderRadius: "50%", background: "#22C55E" }} />
      )}
      {n}
    </button>
  );
}

function RepStrip({ min = 1, max = 20, range, last, logged, onLog }) {
  const [lo, hi] = range || [];
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: true });
  const updateEdges = () => {
    const el = ref.current; if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges(p => (p.left === left && p.right === right ? p : { left, right }));
  };
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const target = el.querySelector(`[data-n="${logged ?? last ?? lo ?? min}"]`);
    if (target) {
      const left = target.offsetLeft - el.clientWidth / 2 + target.clientWidth / 2;
      el.scrollTo({ left, behavior: "instant" });
    }
    updateEdges();
  }, []);
  const fadePx = 28;
  const maskParts = [
    edges.left ? `transparent 0, black ${fadePx}px` : `black 0`,
    edges.right ? `black calc(100% - ${fadePx}px), transparent 100%` : `black 100%`,
  ];
  const maskImage = `linear-gradient(to right, ${maskParts.join(", ")})`;
  return (
    <div style={{ position: "relative", marginTop: 6 }}>
      <div
        ref={ref}
        onScroll={updateEdges}
        className="scroll-row"
        style={{
          display: "flex", gap: 5, overflowX: "auto",
          padding: "8px 4px 6px",
          WebkitOverflowScrolling: "touch",
          WebkitMaskImage: maskImage, maskImage,
        }}
      >
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map(n => {
          const inRange = lo != null && n >= lo && n <= hi;
          return (
            <div key={n} data-n={n}>
              <RepCell n={n} inRange={inRange} isLast={last === n && logged !== n} isLogged={logged === n} onClick={() => onLog(n)} />
            </div>
          );
        })}
      </div>
      <div aria-hidden style={{
        position: "absolute", left: 2, top: "50%", transform: "translateY(-50%)",
        width: 22, height: 22, borderRadius: 11,
        background: "rgba(17,24,39,0.92)", border: "1px solid #374151",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#D1D5DB", fontSize: 14, fontWeight: 800, fontFamily: T.mono, lineHeight: 1,
        opacity: edges.left ? 1 : 0, transition: "opacity 160ms ease",
        pointerEvents: "none", animation: edges.left ? "repNudgeL 2.4s ease-in-out infinite" : "none",
      }}>‹</div>
      <div aria-hidden style={{
        position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)",
        width: 22, height: 22, borderRadius: 11,
        background: "rgba(17,24,39,0.92)", border: "1px solid #374151",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#D1D5DB", fontSize: 14, fontWeight: 800, fontFamily: T.mono, lineHeight: 1,
        opacity: edges.right ? 1 : 0, transition: "opacity 160ms ease",
        pointerEvents: "none", animation: edges.right ? "repNudgeR 2.4s ease-in-out infinite" : "none",
      }}>›</div>
    </div>
  );
}

// ─── file: workout-session-rest-timer.js ───

function RestTimer({ rest, onAdd, onSkip, onToggle }) {
  const { left, total, paused, kind } = rest;
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, "0");
  const pct = total > 0 ? (1 - left / total) * 100 : 100;
  const done = left === 0;
  const accent = done ? T.green : kind === "warmup" ? T.amber : T.accentLight;
  const accentBg = done ? "rgba(52,211,153,0.10)" : kind === "warmup" ? "rgba(251,191,36,0.10)" : "rgba(96,165,250,0.10)";
  const ghostBtn = {
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${accent}40`,
    color: accent,
    fontFamily: T.mono, fontSize: 11, fontWeight: 700,
    padding: "6px 10px", borderRadius: 7, cursor: "pointer", letterSpacing: 0.3,
  };
  return (
    <div style={{
      marginTop: 12, borderRadius: 12,
      background: accentBg, border: `1px solid ${accent}55`,
      padding: "12px 14px 10px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`,
        background: `linear-gradient(90deg, ${accent}30, ${accent}14)`,
        transition: "width 1s linear",
      }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <span style={{ color: accent, fontSize: 9, fontWeight: 800, letterSpacing: 0.8, fontFamily: T.mono }}>
            {done ? "REST DONE" : paused ? "REST · PAUSED" : "REST"}
          </span>
          <span style={{ color: T.strong, fontFamily: T.mono, fontSize: 28, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.05 }}>
            {m}:{s}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => onAdd(15)} style={ghostBtn}>+15s</button>
          <button onClick={onToggle} style={{ ...ghostBtn, minWidth: 32 }}>{paused ? "▶" : "❚❚"}</button>
          <button onClick={onSkip} style={{ ...ghostBtn, background: accent, color: T.inv, borderColor: accent }}>
            {done ? "✓ next" : "skip"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── file: workout-session-volume-bar.js ───

function VolumeBar({ exerciseName, muscle, events, isPrimary, showTip, hideTip }) {
  const TARGET_MIN = 10, TARGET_MAX = 20;
  const sets = events.reduce((a, ev) => a + (ev.weightage ?? 1.0), 0);
  const DAY_MS = 86400000;
  
  const today = localDate();
  const todayMs = Date.parse(today + 'T00:00:00Z');

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const ms = todayMs - i * DAY_MS;
    const d = new Date(ms);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({ date: dateStr, label: String(d.getUTCDate()), events: [], isToday: i === 0 });
  }
  events.forEach(ev => {
    const day = days.find(d => d.date === ev.date);
    if (day) day.events.push(ev);
  });

  const PALETTE = [
    { hue: 152 }, // green
    { hue: 200 }, // blue
    { hue: 30 },  // orange
    { hue: 280 }, // violet
    { hue: 340 }, // pink
    { hue: 50 },  // amber
  ];

  const exerciseOrder = [];
  events.forEach(ev => { if (!exerciseOrder.includes(ev.exercise)) exerciseOrder.push(ev.exercise); });
  const exerciseHue = {};
  exerciseOrder.forEach((name, i) => { exerciseHue[name] = PALETTE[i % PALETTE.length].hue; });

  const topScorePerEx = {};
  events.forEach(ev => {
    const sc = ev.weight * ev.reps;
    if (sc > (topScorePerEx[ev.exercise] || 0)) topScorePerEx[ev.exercise] = sc;
  });

  const maxPerDay = Math.max(4, ...days.map(d => d.events.length));
  const CHART_H = 64;
  const GAP = 1.5;
  const SLICE_H = Math.max(3, Math.floor((CHART_H - (maxPerDay - 1) * GAP) / maxPerDay));
  const countColor = sets === 0 ? T.faint
                    : sets < TARGET_MIN ? T.red
                    : sets <= TARGET_MAX ? T.green
                    : T.amber;

  const sliceStyle = (ev, isToday) => {
    const hue = exerciseHue[ev.exercise] ?? 152;
    const top = topScorePerEx[ev.exercise] || 1;
    const score = (ev.weight * ev.reps) / top;
    const hardness = Math.max(0.35, Math.min(1, score || 0.35));
    const sat = Math.round(55 + hardness * 35);
    const light = Math.round(isToday ? (44 + hardness * 12) : (38 + hardness * 14));
    const alpha = (isToday ? 1 : 0.85) * (ev.weightage < 1.0 ? 0.55 : 1.0);
    return {
      background: `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`,
      boxShadow: isToday && ev.weightage === 1.0 ? `0 0 6px hsla(${hue}, ${sat}%, 60%, 0.5)` : "none",
      border: "none",
    };
  };

  const formatSets = (s) => {
    if (Number.isInteger(s)) return String(s);
    return s.toFixed(1);
  };

  const getSliceHeight = (ev) => {
    const baseH = SLICE_H;
    if (ev.weightage < 1.0) {
      return Math.max(2, Math.floor(baseH * ev.weightage));
    }
    return baseH;
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>
          {muscle.replace("_", " ")}{!isPrimary && ` (${Math.round(getMuscleImpact(exerciseName, muscle, false) * 100)}%)`}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 800 }}>
          <span style={{ color: countColor }}>{formatSets(sets)}</span>
          <span style={{ color: T.disabled, fontWeight: 500 }}> / 10-20</span>
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", height: CHART_H, gap: 3 }}>
        {days.map((d, i) => (
          <div key={i} style={{
            flex: 1, minWidth: 0,
            display: "flex", flexDirection: "column-reverse",
            gap: `${GAP}px`, height: "100%", justifyContent: "flex-start",
          }}>
            {d.events.length === 0 ? (
              <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 1 }} />
            ) : (
              d.events.map((ev, j) => (
                <div key={j}
                  onMouseEnter={(e) => showTip(e, `${ev.exercise} · ${ev.weight}lb × ${ev.reps} · ${ev.date}${ev.weightage < 1.0 ? ` (secondary: ${Math.round(ev.weightage * 100)}%)` : ""}`)}
                  onMouseLeave={hideTip}
                  style={{
                    height: getSliceHeight(ev),
                    borderRadius: 2,
                    cursor: "default",
                    ...sliceStyle(ev, d.isToday),
                  }} />
              ))
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
        {days.map((d, i) => (
          <span key={i} style={{
            flex: 1, textAlign: "center",
            color: d.isToday ? T.accentLight : (d.events.length ? T.muted : T.disabled),
            fontFamily: T.mono, fontSize: 9,
            fontWeight: d.isToday ? 800 : (d.events.length ? 600 : 500),
          }}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

// ─── file: workout-session-sparkline.js ───

function Sparkline({ exerciseName, data, valueKey, color, label, fmt, showTip, hideTip }) {
  const DAY_MS = 86400000;
  
  const today = localDate();
  const todayMs = Date.parse(today + 'T00:00:00Z');

  const days = [];
  for (let i = 29; i >= 0; i--) {
    const ms = todayMs - i * DAY_MS;
    const d = new Date(ms);
    days.push({
      date: d.toISOString().slice(0, 10),
      label: String(d.getUTCDate()),
      isToday: i === 0,
      isFuture: false,
      value: null,
    });
  }
  (data || []).forEach(d => {
    const day = days.find(x => x.date === d.date);
    if (day) day.value = +d[valueKey] || 0;
  });

  const isAssist = exerciseName === "Pull-Ups" || exerciseName === "Dips" || exerciseName === "Dead Hang + Scap Pulls" || exerciseName === "Hanging Knee Raise";
  const isValidVal = (v) => v != null && (isAssist ? v > -1000 : v > 0);

  const historicalVals = days.filter(d => isValidVal(d.value)).map(d => d.value);
  if (historicalVals.length === 0) {
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{label}</span>
          <span style={{ color: T.disabled, fontFamily: T.mono, fontSize: 10 }}>—</span>
        </div>
        <div style={{ height: 38, display: "flex", alignItems: "center", justifyContent: "center", color: T.disabled, fontFamily: T.mono, fontSize: 10, border: `1px dashed ${T.cardBorder}`, borderRadius: 4 }}>no data in last 30 days</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ color: T.disabled, fontFamily: T.mono, fontSize: 9 }}>{days[0].date.slice(5)}</span>
          <span style={{ color: T.accentLight, fontFamily: T.mono, fontSize: 9, fontWeight: 800 }}>Today</span>
        </div>
      </div>
    );
  }

  const first = historicalVals[0], last = historicalVals[historicalVals.length - 1];
  const lastDay = [...days].reverse().find(d => isValidVal(d.value));
  const lastDate = lastDay ? lastDay.date : null;

  const presentVals = days.filter(d => isValidVal(d.value)).map(d => d.value);
  let min = Math.min(...presentVals);
  let max = Math.max(...presentVals);

  const hasGoal = exerciseName === "Barbell Bench Press" && valueKey === "orm";
  const goalVal = 180;
  if (hasGoal) {
    max = Math.max(max, goalVal);
    min = Math.min(min, goalVal * 0.6);
  }
  const range = max - min || max || 1;
  const w = 280, h = 38, padX = 8, padY = 4;
  const totalSlots = days.length - 1;
  const dayX = (i) => padX + (i * (w - 2 * padX)) / totalSlots;
  const yFor = (v) => h - padY - ((v - min) / range) * (h - 2 * padY);

  const pts = days.map((d, i) => isValidVal(d.value) ? {
    x: dayX(i), y: yFor(d.value), value: d.value, isToday: d.isToday, isFuture: d.isFuture, date: d.date,
  } : null);
  const presentPts = pts.filter(Boolean);

  const linePath = presentPts.length > 1
    ? presentPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
    : "";
  const areaPath = presentPts.length > 1
    ? `${linePath} L ${presentPts[presentPts.length-1].x.toFixed(1)} ${h} L ${presentPts[0].x.toFixed(1)} ${h} Z`
    : "";

  // Divide by |first| — assist-exercise 1RM series are negative, and a signed
  // denominator would flip the trend direction.
  const delta = first ? Math.round(((last - first) / Math.abs(first)) * 100) : 0;
  const deltaColor = delta > 0 ? T.green : delta < 0 ? T.red : T.faint;
  const gradId = `spark-${label.replace(/[^a-z0-9]/gi, "")}-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{label}</span>
        <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 800, color: T.strong }}>
          {fmt(last)}
          {historicalVals.length > 1 && (
            <span style={{ color: deltaColor, fontWeight: 700, marginLeft: 6, fontSize: 10 }}>
              {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {Math.abs(delta)}%
            </span>
          )}
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", height: h }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
        {hasGoal && (
          <g>
            <line x1={padX} y1={yFor(goalVal)} x2={w - padX} y2={yFor(goalVal)}
              stroke="rgba(239, 68, 68, 0.45)" strokeWidth="1" strokeDasharray="3 3" />
            <text x={w - padX - 4} y={yFor(goalVal) + 9} font-size="7.5px" fill="rgba(239, 68, 68, 0.8)" font-weight="800" text-anchor="end">
              Goal: {goalVal} lb
            </text>
          </g>
        )}
        {[0, 7, 14, 21, 28].map(d => {
          const slotIdx = 29 - d;
          if (slotIdx < 0) return null;
          return (
            <line key={`g${d}`} x1={dayX(slotIdx)} y1={padY} x2={dayX(slotIdx)} y2={h - padY}
              stroke={d === 0 ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.04)"}
              strokeWidth={d === 0 ? 1 : 0.5}
              strokeDasharray={d === 0 ? "" : "2 3"} />
          );
        })}
        {presentPts.map((p, i) => {
          return (
            <g key={`p${i}`}>
              <circle cx={p.x} cy={p.y} r={p.isToday ? 3.2 : 2.4} fill={color}
                stroke={p.isToday ? "rgba(11,15,20,0.9)" : "none"} strokeWidth={p.isToday ? 1 : 0} />
              <circle cx={p.x} cy={p.y} r="8" fill="transparent"
                style={{ cursor: "default" }}
                onMouseEnter={(e) => showTip(e, `${p.date} · ${fmt(p.value)}${p.isToday ? " (today)" : ""}`)}
                onMouseLeave={hideTip} />
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
        <span style={{ color: T.disabled, fontFamily: T.mono, fontSize: 9 }}>{days[0].date.slice(5)}</span>
        <span style={{ color: T.accentLight, fontFamily: T.mono, fontSize: 9, fontWeight: 800 }}>Today</span>
      </div>
    </div>
  );
}

// ─── file: workout-session-nav-chip.js ───

function navSetDisplay(s, exercise) {
  if (exercise.stages) {
    const rank = (id) => stageRank(exercise.stages, id);
    const cur = rank(s.grip) > 0 ? `S${rank(s.grip)}` : null;
    const prev = rank(s.lastGrip) > 0 ? `S${rank(s.lastGrip)}` : null;
    if (s.completed) return { lb: cur, reps: s.reps, state: "done", kind: s.kind };
    if (s.active) {
      const reps = s.reps != null ? s.reps : (s.lastReps != null ? s.lastReps : null);
      return { lb: cur || prev, reps, state: "current", kind: s.kind };
    }
    return { lb: cur || prev, reps: s.lastReps != null ? s.lastReps : null, state: "upcoming", preview: true, kind: s.kind };
  }
  const isBW = exercise.mode === "bodyweight";
  const isAssist = exercise.assist;
  const isBandsOnly = exercise.isBandsOnly;
  const baseW = isBW ? (s.bodyweight || 0) : (s.weight || 0);
  const lastBaseW = isBW ? (s.lastBodyweight || 0) : (s.lastWeight || 0);
  const bandSum = (s.bands || []).reduce((a, b) => a + b, 0);
  const lastBandSum = (s.lastBands || []).reduce((a, b) => a + b, 0);
  const cur = isAssist ? Math.max(0, baseW - bandSum) : (isBandsOnly ? bandSum : baseW + bandSum);
  const prevW = isAssist ? Math.max(0, lastBaseW - lastBandSum) : (isBandsOnly ? lastBandSum : lastBaseW + lastBandSum);
  if (s.completed) return { lb: cur, reps: s.reps, state: "done", kind: s.kind };
  if (s.active) {
    const reps = s.reps != null ? s.reps : (s.lastReps != null ? s.lastReps : null);
    return { lb: cur || prevW, reps, state: "current", kind: s.kind };
  }
  return { lb: prevW || cur, reps: s.lastReps != null ? s.lastReps : null, state: "upcoming", preview: true, kind: s.kind };
}

function SetChip({ d, k, onClick }) {
  let box;
  if (d.state === "current") {
    box = { border: "1px solid rgba(96,165,250,0.85)", background: "rgba(59,130,246,0.85)", color: "#FFFFFF", xColor: "rgba(255,255,255,0.65)" };
  } else if (d.state === "done") {
    box = { border: "1px solid rgba(52,211,153,0.32)", background: "rgba(52,211,153,0.07)", color: T.strong, xColor: T.faint };
  } else {
    box = { border: "1px dashed rgba(255,255,255,0.16)", background: "transparent", color: T.muted, xColor: T.disabled };
  }

  if (d.kind === "warmup") {
    if (d.state === "current") {
      box.border = "1px solid rgba(251,191,36,0.85)";
      box.background = "rgba(251,191,36,0.85)";
    } else if (d.state === "done") {
      box.border = "1px solid rgba(251,191,36,0.4)";
      box.background = "rgba(251,191,36,0.08)";
    } else {
      box.border = "1px dashed rgba(251,191,36,0.4)";
    }
  }
  return (
    <span key={k} onClick={onClick} style={{
      display: "inline-flex", alignItems: "baseline", gap: 1,
      padding: "5px 9px", borderRadius: 8,
      border: box.border, background: box.background, color: box.color,
      fontFamily: T.mono, fontSize: 12.5, fontWeight: 700,
      fontStyle: d.preview ? "italic" : "normal", whiteSpace: "nowrap",
      cursor: onClick ? "pointer" : "default",
    }}>
      {d.lb || "—"}<span style={{ color: box.xColor, fontWeight: 400, fontSize: 11 }}>×</span>{d.reps != null ? d.reps : "—"}
    </span>
  );
}

// ─── file: workout-session-nav-row.js ───

function ExerciseNavRow({ i, exercises, shownIdx, currentIdx, onSelect, onSelectSet, onSwapExercise, swapOpenIdx, setSwapOpenIdx, showAllFamilies, setShowAllFamilies }) {
  const e = exercises[i];
  const doneWork = e.sets.filter(s => s.completed).length;
  const allDone = e.sets.length > 0 && e.sets.every(s => s.completed);
  let status = "upcoming";
  if (e.skipped) status = "skipped";
  else if (allDone) status = "done";
  else if (i === currentIdx) status = "current";

  const tag = e.superset ? `${e.superset}${e.supersetPos || ""}` : null;
  const swapGroup = getSwapGroup(e.name);
  const hasVariants = swapGroup && swapGroup.length > 1;
  const workLogged = e.sets.some(s => s.completed && s.kind === "work");
  const swapOpen = swapOpenIdx === i;
  
  const nameColor = status === "skipped" ? T.muted : T.strong;

  const STATUS_COLOR = { done: T.green, current: T.accentLight, skipped: T.disabled, upcoming: T.faint };
  const STATUS_GLYPH = { done: "✓", current: "●", skipped: "×", upcoming: "○" };

  const iconBox = ({ glyph, active, color, bg, border, onClick, title }) => (
    <button
      onClick={onClick}
      title={title}
      style={{
        flexShrink: 0, width: 28, height: 26, padding: 0, borderRadius: 7,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: "inherit", fontSize: 12, lineHeight: 1,
        cursor: onClick ? "pointer" : "default",
        border: border || `1px solid ${active ? "rgba(96,165,250,0.6)" : T.cardBorder}`,
        background: bg || (active ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.03)"),
        color: color || (active ? T.accentLight : T.faint),
      }}
    >{glyph}</button>
  );

  const tagChip = (tag) => (
    <span style={{
      color: T.bandsText, fontFamily: T.mono, fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
      padding: "2px 6px", borderRadius: 5, background: "rgba(192,132,252,0.18)", border: "1px solid rgba(192,132,252,0.3)",
      flexShrink: 0, marginRight: 8,
    }}>{tag}</span>
  );

  const chipRow = (e) => {
    const work = e.sets;
    if (!work.length) return null;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
        {work.map((s, k) => (
          <SetChip
            key={k}
            k={k}
            d={navSetDisplay(s, e)}
            onClick={(ev) => {
              ev.stopPropagation();
              if (onSelectSet) onSelectSet(i, k);
            }}
          />
        ))}
      </div>
    );
  };

  const styleTag = (
    <style>{`
      .exercise-card-media {
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease, border-radius 0.25s ease;
        transform-origin: right center;
        z-index: 10;
      }
      .exercise-card-media:hover {
        transform: scale(2.8);
        box-shadow: 0 12px 36px rgba(0,0,0,0.7);
        z-index: 100;
        border-radius: 8px !important;
        border-left: none !important;
      }
    `}</style>
  );

  return (
    <div style={{ padding: "11px 106px 11px 12px", position: "relative" }}>
      {styleTag}
      <div onClick={() => onSelect(i)} role="button" style={{
        display: "flex", alignItems: "center", gap: 9, cursor: "pointer",
      }}>
        <span style={{ width: 13, textAlign: "center", color: STATUS_COLOR[status], fontSize: 12, flexShrink: 0, marginTop: 0 }}>{STATUS_GLYPH[status]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {tag && tagChip(tag)}
          <span style={{
            color: nameColor, fontSize: 14, fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.3,
            textDecoration: status === "skipped" ? "line-through" : "none",
          }}>
            {e.name}
            <span style={{ fontSize: 11, color: T.faint, fontWeight: 500, marginLeft: 6, fontFamily: T.mono }}>
              (~{Math.round(estimateExerciseDuration(e) / 60)} min)
            </span>
          </span>
        </div>
        {hasVariants && iconBox({
          glyph: "⇄", active: swapOpen, title: "Swap variant",
          onClick: (ev) => { ev.stopPropagation(); setSwapOpenIdx(o => o === i ? null : i); },
        })}
        {e.deferred && status !== "done" && iconBox({
          glyph: "↓", color: T.amber, border: "1px solid rgba(251,191,36,0.4)", bg: "rgba(251,191,36,0.12)",
          title: "Deferred — moved to later",
        })}
        <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 800, color: status === "done" ? T.green : T.faint, flexShrink: 0, marginTop: 0 }}>
          {doneWork}/{e.sets.length}
        </span>
      </div>

      <div 
        className="exercise-card-media"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 96,
          background: "rgba(255, 255, 255, 0.02)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          borderTopRightRadius: 11,
          borderBottomRightRadius: 11,
        }}
      >
        {window.getExerciseIcon ? (
          <div dangerouslySetInnerHTML={{ __html: window.getExerciseIcon(e.name) }} style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }} />
        ) : (
          <span style={{ fontSize: 12 }}>📷</span>
        )}
      </div>

      {!e.skipped && hasVariants && swapOpen && (() => {
        const currentFamilyName = getSwapGroupName(e.name) || "Other";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
            <div style={{ color: T.faint, fontFamily: T.mono, fontSize: 9, fontWeight: 700, paddingLeft: 2 }}>
              FAMILY: {currentFamilyName.toUpperCase()}
            </div>
            {swapGroup.map(opt => {
              const isSel = opt.name === e.name;
              const locked = workLogged && !isSel;
              return (
                <button
                  key={opt.name}
                  onClick={(ev) => { ev.stopPropagation(); if (!isSel && !locked) { onSwapExercise(i, opt.name); setSwapOpenIdx(null); } }}
                  disabled={isSel || locked}
                  style={{
                    textAlign: "left", padding: "6px 9px", borderRadius: 7, fontFamily: "inherit",
                    fontSize: 12, fontWeight: 600,
                    cursor: isSel ? "default" : locked ? "not-allowed" : "pointer",
                    border: isSel ? "1px solid rgba(96,165,250,0.6)" : `1px solid ${T.cardBorder}`,
                    background: isSel ? "rgba(96,165,250,0.16)" : locked ? "transparent" : "rgba(255,255,255,0.04)",
                    color: isSel ? "#DBEAFE" : locked ? T.disabled : T.text,
                    opacity: locked ? 0.5 : 1,
                  }}
                >{isSel && <span style={{ color: T.accentLight, marginRight: 6 }}>●</span>}{opt.name}</button>
              );
            })}
            {workLogged && <span style={{ color: T.disabled, fontFamily: T.mono, fontSize: 9, paddingLeft: 2 }}>locked — sets logged</span>}

            <div style={{ marginTop: 4 }}>
              <button
                onClick={(ev) => { ev.stopPropagation(); setShowAllFamilies(!showAllFamilies); }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: T.accentLight,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 2px",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <span>{showAllFamilies ? "▾ Hide other families" : "▸ Other families..."}</span>
              </button>

              {showAllFamilies && (
                <div style={{
                  marginTop: 6,
                  padding: 8,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.01)",
                  border: `1px solid ${T.cardBorder}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  maxHeight: 200,
                  overflowY: "auto",
                }}>
                  {SWAP_GROUPS.map(grp => {
                    if (grp.family === currentFamilyName) return null;
                    return (
                      <div key={grp.family} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ color: T.faint, fontFamily: T.mono, fontSize: 8.5, fontWeight: 700, borderBottom: `1px dashed ${T.cardBorder}`, paddingBottom: 1 }}>
                          {grp.family}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {grp.exercises.map(opt => {
                            const locked = workLogged;
                            return (
                              <button
                                key={opt.name}
                                onClick={(ev) => { ev.stopPropagation(); if (!locked) { onSwapExercise(i, opt.name); setSwapOpenIdx(null); } }}
                                disabled={locked}
                                style={{
                                  textAlign: "left", padding: "4px 6px", borderRadius: 5,
                                  fontFamily: "inherit", fontSize: 11, fontWeight: 600,
                                  cursor: locked ? "not-allowed" : "pointer",
                                  border: `1px solid ${T.cardBorder}`,
                                  background: "rgba(255,255,255,0.02)",
                                  color: T.text,
                                  opacity: locked ? 0.45 : 1,
                                }}
                              >
                                {opt.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {!e.skipped && chipRow(e)}
    </div>
  );
}

// ─── file: workout-session-exercise-nav.js ───

// ExerciseNav — the workout's exercise list. Desktop LEFT pane
// (variant="list", rich) and mobile top strip (variant="strip", compact).
// Tapping a row focuses that exercise in the center column; the App's onSelect
// also activates the exercise's next set so you can log it.

function ExerciseNav({ exercises, shownIdx, currentIdx, onSelect, onSelectSet, onSwapExercise, onAddExercise, variant, isFinished }) {
  const [swapOpenIdx, setSwapOpenIdx] = useState(null);
  const [showAllFamilies, setShowAllFamilies] = useState(false);
  const [showAddLibrary, setShowAddLibrary] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    setShowAllFamilies(false);
  }, [swapOpenIdx]);

  useEffect(() => {
    if (showAddLibrary) {
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearchQuery("");
    }
  }, [showAddLibrary]);

  const STATUS_COLOR = { done: T.green, current: T.accentLight, skipped: T.disabled, upcoming: T.faint };
  const STATUS_GLYPH = { done: "✓", current: "●", skipped: "×", upcoming: "○" };

  const meta = (e, i) => {
    const doneWork = e.sets.filter(s => s.completed).length;
    const allDone = e.sets.length > 0 && e.sets.every(s => s.completed);
    let status = "upcoming";
    if (e.skipped) status = "skipped";
    else if (allDone) status = "done";
    else if (i === currentIdx) status = "current";
    return {
      work: e.sets, doneWork, totalWork: e.sets.length, status,
      tag: e.superset ? `${e.superset}${e.supersetPos || ""}` : null,
    };
  };

  const renderLibraryModal = () => {
    if (!showAddLibrary) return null;
    
    const filteredGroups = SWAP_GROUPS.map(grp => {
      const matchingExercises = grp.exercises.filter(opt =>
        opt.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      return { ...grp, exercises: matchingExercises };
    }).filter(grp => grp.exercises.length > 0);

    return createPortal(
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)", zIndex: 10000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16
      }} onClick={() => setShowAddLibrary(false)}>
        <div style={{
          background: T.cardBg, border: `1px solid ${T.cardBorder}`,
          borderRadius: 16, width: "100%", maxWidth: 360,
          maxHeight: "80vh", display: "flex", flexDirection: "column",
          padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
        }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: T.faint, fontWeight: 800, fontFamily: T.mono, letterSpacing: 0.5 }}>ADD EXERCISE FROM LIBRARY</span>
            <button onClick={() => setShowAddLibrary(false)} style={{
              background: "transparent", border: "none", color: T.accentLight, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 4
            }}>✕</button>
          </div>
          <div style={{ marginBottom: 16 }}>
            <input
              ref={searchInputRef}
              autoFocus
              type="text"
              placeholder="Search exercises..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={{
                width: "100%",
                background: "rgba(255, 255, 255, 0.03)",
                border: searchFocused ? `1px solid ${T.accentLight}` : `1px solid ${T.cardBorder}`,
                boxShadow: searchFocused ? `0 0 8px rgba(96,165,250,0.25)` : "none",
                borderRadius: 10,
                padding: "10px 14px",
                color: T.strong,
                fontFamily: "inherit",
                fontSize: 13,
                outline: "none",
                transition: "all 150ms ease",
              }}
            />
          </div>
          <div style={{
            display: "flex", flexDirection: "column", gap: 12,
            overflowY: "auto", flex: 1, paddingRight: 4
          }}>
            {filteredGroups.length === 0 ? (
              <div style={{ textAlign: "center", color: T.faint, padding: "20px 0", fontSize: 12, fontFamily: T.mono }}>
                No matching exercises found
              </div>
            ) : (
              filteredGroups.map(grp => (
                <div key={grp.family} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, borderBottom: `1px dashed rgba(255,255,255,0.06)`, paddingBottom: 2 }}>
                    {grp.family}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {grp.exercises.map(opt => (
                      <button
                        key={opt.name}
                        onClick={() => { onAddExercise(opt.name); setShowAddLibrary(false); }}
                        style={{
                          padding: "6px 10px", borderRadius: 8,
                          fontFamily: "inherit", fontSize: 11.5, fontWeight: 600,
                          cursor: "pointer",
                          border: `1px solid ${T.cardBorder}`,
                          background: "rgba(255,255,255,0.02)",
                          color: T.text,
                        }}
                      >
                        {opt.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  if (variant === "strip") {
    return (
      <React.Fragment>
        <div className="scroll-row" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 16px" }}>
          {exercises.map((e, i) => {
            const m = meta(e, i);
            const sel = i === shownIdx;
            return (
              <button key={e.id} onClick={() => onSelect(i)} style={{
                flex: "0 0 auto", width: 132, textAlign: "left",
                padding: "8px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                border: sel ? `1px solid ${T.accentLight}` : `1px solid ${T.cardBorder}`,
                background: sel ? "rgba(96,165,250,0.14)" : "rgba(255,255,255,0.03)",
                transition: "all 150ms ease",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                  <span style={{ color: STATUS_COLOR[m.status], fontSize: 10, flexShrink: 0 }}>{STATUS_GLYPH[m.status]}</span>
                  {m.tag && <span style={{ color: T.bands, fontFamily: T.mono, fontSize: 9, fontWeight: 800 }}>{m.tag}</span>}
                  <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 9, color: m.status === "done" ? T.green : T.faint }}>
                    (~{Math.round(estimateExerciseDuration(e) / 60)}m) {m.doneWork}/{m.totalWork}
                  </span>
                </div>
                <div style={{
                  color: m.status === "skipped" ? T.muted : T.strong,
                  fontSize: 12, fontWeight: 700, lineHeight: 1.25,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                  textDecoration: m.status === "skipped" ? "line-through" : "none",
                  minHeight: 30,
                }}>{e.name}</div>
              </button>
            );
          })}
          {isFinished && (
            <button onClick={() => onSelect(null)} style={{
              flex: "0 0 auto", width: 132, textAlign: "left",
              padding: "8px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
              border: shownIdx === null ? `1px solid ${T.accentLight}` : `1px solid ${T.cardBorder}`,
              background: shownIdx === null ? "rgba(96,165,250,0.14)" : "rgba(255,255,255,0.03)",
              transition: "all 150ms ease",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <span style={{ color: T.green, fontSize: 10, flexShrink: 0 }}>🎉</span>
                <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 9, color: T.green }}>100%</span>
              </div>
              <div style={{
                color: T.strong,
                fontSize: 12, fontWeight: 700, lineHeight: 1.25,
                minHeight: 30,
              }}>Workout Summary</div>
            </button>
          )}
          <button onClick={() => setShowAddLibrary(true)} style={{
            flex: "0 0 auto", width: 132, textAlign: "center",
            padding: "8px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
            border: `1px dashed rgba(96,165,250,0.4)`,
            background: "rgba(96,165,250,0.03)",
            color: T.accentLight, fontWeight: 700, fontSize: 12,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
            minHeight: 52
          }}>
            <span>＋ Add</span>
            <span style={{ fontSize: 9, opacity: 0.8 }}>from Library</span>
          </button>
        </div>
        {renderLibraryModal()}
      </React.Fragment>
    );
  }

  // Desktop list view: group consecutive supersets
  const groups = [];
  exercises.forEach((e, i) => {
    const last = groups[groups.length - 1];
    if (e.superset && last && last.superset === e.superset) last.items.push(i);
    else groups.push({ superset: e.superset || null, items: [i] });
  });

  const cardShell = (i, children) => {
    const sel = i === shownIdx;
    return (
      <div style={{
        borderRadius: 12, overflow: "visible", position: "relative",
        border: sel ? "1px solid rgba(96,165,250,0.6)" : `1px solid ${T.cardBorder}`,
        background: sel ? "rgba(96,165,250,0.10)" : "rgba(255,255,255,0.02)",
        boxShadow: sel ? "0 6px 22px -10px rgba(59,130,246,0.6)" : "none",
        transition: "all 150ms ease",
      }}>{children}</div>
    );
  };

  return (
    <React.Fragment>
      <div style={{ padding: 12, borderRadius: 14, background: T.cardBg, border: `1px solid ${T.cardBorder}` }}>
        <div style={{ color: T.faint, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 1.0, marginBottom: 12, padding: "0 2px" }}>EXERCISES</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {groups.map((g, gi) => {
            if (!g.superset) {
              const i = g.items[0];
              return <React.Fragment key={`g${gi}`}>{cardShell(i, 
                <ExerciseNavRow
                  i={i}
                  exercises={exercises}
                  shownIdx={shownIdx}
                  currentIdx={currentIdx}
                  onSelect={onSelect}
                  onSelectSet={onSelectSet}
                  onSwapExercise={onSwapExercise}
                  swapOpenIdx={swapOpenIdx}
                  setSwapOpenIdx={setSwapOpenIdx}
                  showAllFamilies={showAllFamilies}
                  setShowAllFamilies={setShowAllFamilies}
                />
              )}</React.Fragment>;
            }
            // Superset purple container
            return (
              <div key={`g${gi}`} style={{
                borderRadius: 14, overflow: "hidden",
                border: "1px solid rgba(192,132,252,0.28)",
                background: "rgba(192,132,252,0.045)",
                boxShadow: "inset 3px 0 0 rgba(192,132,252,0.65)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 8px", flexWrap: "wrap" }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(192,132,252,0.18)", border: "1px solid rgba(192,132,252,0.35)",
                    color: T.bands, fontSize: 12,
                  }} aria-hidden>⇄</span>
                  <span style={{ color: T.bands, fontFamily: T.mono, fontSize: 11, fontWeight: 800, letterSpacing: 1.2, whiteSpace: "nowrap" }}>SUPERSET {g.superset}</span>
                  <span style={{ color: "rgba(192,132,252,0.65)", fontFamily: T.mono, fontSize: 9, fontWeight: 700, letterSpacing: 1.0, whiteSpace: "nowrap" }}>NO REST BETWEEN</span>
                </div>
                <div style={{ padding: "0 8px 8px" }}>
                  {g.items.map((i, k) => {
                    const sel = i === shownIdx;
                    return (
                      <React.Fragment key={exercises[i].id}>
                        {k > 0 && (
                          <div style={{ display: "flex", justifyContent: "center", margin: "7px 0" }}>
                            <span style={{
                              color: T.bands, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 2,
                              padding: "3px 13px", borderRadius: 99,
                              border: "1px solid rgba(192,132,252,0.4)", background: "rgba(192,132,252,0.10)",
                            }}>THEN</span>
                          </div>
                        )}
                        <div style={{
                          borderRadius: 10, overflow: "hidden",
                          border: sel ? "1px solid rgba(96,165,250,0.6)" : "1px solid rgba(255,255,255,0.06)",
                          background: sel ? "rgba(96,165,250,0.10)" : "rgba(0,0,0,0.18)",
                          boxShadow: sel ? "0 6px 22px -10px rgba(59,130,246,0.6)" : "none",
                          transition: "all 150ms ease",
                        }}>
                          <ExerciseNavRow
                            i={i}
                            exercises={exercises}
                            shownIdx={shownIdx}
                            currentIdx={currentIdx}
                            onSelect={onSelect}
                            onSelectSet={onSelectSet}
                            onSwapExercise={onSwapExercise}
                            swapOpenIdx={swapOpenIdx}
                            setSwapOpenIdx={setSwapOpenIdx}
                            showAllFamilies={showAllFamilies}
                            setShowAllFamilies={setShowAllFamilies}
                          />
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {isFinished && (
            <div onClick={() => onSelect(null)} style={{
              borderRadius: 12, overflow: "hidden",
              border: shownIdx === null ? "1px solid rgba(96,165,250,0.6)" : `1px solid ${T.cardBorder}`,
              background: shownIdx === null ? "rgba(96,165,250,0.10)" : "rgba(255,255,255,0.02)",
              boxShadow: shownIdx === null ? "0 6px 22px -10px rgba(59,130,246,0.6)" : "none",
              transition: "all 150ms ease",
              cursor: "pointer",
              padding: "11px 12px",
              display: "flex",
              alignItems: "center",
              gap: 9
            }}>
              <span style={{ fontSize: 14 }}>🎉</span>
              <span style={{ color: T.strong, fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>Workout Summary</span>
              <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 11, fontWeight: 800, color: T.green }}>100%</span>
            </div>
          )}
          <div style={{ marginTop: 12, borderTop: `1px solid ${T.cardBorder}`, paddingTop: 12 }}>
            <button onClick={() => setShowAddLibrary(true)} style={{
              width: "100%", padding: "10px 12px", borderRadius: 12,
              border: `1px dashed rgba(96,165,250,0.4)`, background: "rgba(96,165,250,0.03)",
              color: T.accentLight, fontWeight: 700, fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              transition: "all 150ms ease"
            }}>
              <span>＋</span> Add Exercise from Library
            </button>
          </div>
        </div>
      </div>
      {renderLibraryModal()}
    </React.Fragment>
  );
}

// ─── file: workout-session-barbell-visualizer.js ───

function BarbellVisualizer({ weight, onWeightChange }) {
  const PLATE_COLORS = {
    45: { bg: "#3B82F6", text: "#FFFFFF" }, // blue
    35: { bg: "#EAB308", text: "#1E293B" }, // yellow
    25: { bg: "#10B981", text: "#FFFFFF" }, // green
    15: { bg: "#F97316", text: "#FFFFFF" }, // orange
    10: { bg: "#F8FAFC", text: "#1E293B" }, // white
    5: { bg: "#6B7280", text: "#FFFFFF" },  // grey
    2.5: { bg: "#EF4444", text: "#FFFFFF" }, // red
    1: { bg: "#06B6D4", text: "#FFFFFF" },   // cyan
    0.5: { bg: "#A855F7", text: "#FFFFFF" }, // purple
  };

  const PLATE_SIZES = [45, 35, 25, 15, 10, 5, 2.5, 1, 0.5];
  const B_WIDTHS = { 45: 28, 35: 24, 25: 20, 15: 16, 10: 14, 5: 14, 2.5: 13, 1: 12, 0.5: 11 };
  const B_HEIGHTS = { 45: 66, 35: 66, 25: 66, 15: 66, 10: 66, 5: 36, 2.5: 33, 1: 30, 0.5: 27 };

  // Decompose weight into plates on one side
  const loadedPlates = [];
  let rem = (weight - 45) / 2;
  if (rem > 0) {
    for (const p of PLATE_SIZES) {
      while (rem >= p - 0.0001) {
        loadedPlates.push(p);
        rem = Math.round((rem - p) * 100) / 100;
      }
    }
  }

  const handleAddPlate = (p) => onWeightChange(weight + p * 2);
  const handleRemovePlateAtIndex = (idx) => onWeightChange(Math.max(45, weight - loadedPlates[idx] * 2));
  const handleClear = () => onWeightChange(45);

  const getPlateWidth = (p) => ({ 45: 18, 35: 14, 25: 11, 15: 9, 10: 8, 5: 8, 2.5: 7, 1: 6, 0.5: 5 }[p] || 12);
  const getPlateHeight = (p) => ({ 45: 72, 35: 72, 25: 72, 15: 72, 10: 72, 5: 33, 2.5: 27, 1: 22, 0.5: 18 }[p] || 36);

  const renderSleeve = (side) => {
    const isLeft = side === "left";
    return (
      <div style={{
        position: "absolute",
        [isLeft ? "right" : "left"]: "65%",
        [isLeft ? "marginRight" : "marginLeft"]: 2,
        display: "flex",
        flexDirection: isLeft ? "row-reverse" : "row",
        alignItems: "center",
        gap: 2,
      }}>
        {loadedPlates.map((p, idx) => {
          const isDarkText = PLATE_COLORS[p].text === "#1E293B";
          const textShadow = isDarkText
            ? "0 0 2px #fff, 0 0 2px #fff, 0 0 2px #fff"
            : "0 0 2px #000, 0 0 2px #000, 0 0 2px #000";
          return (
            <div
              key={`${side}-${idx}`}
              onClick={() => handleRemovePlateAtIndex(idx)}
              title="Click to remove plate"
              style={{
                width: getPlateWidth(p),
                height: getPlateHeight(p),
                background: PLATE_COLORS[p].bg,
                color: PLATE_COLORS[p].text,
                fontSize: p >= 25 ? 12.5 : p >= 10 ? 11 : 9.5,
                fontWeight: 900,
                fontFamily: T.mono,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 2,
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
                userSelect: "none",
                transition: "transform 100ms",
                whiteSpace: "nowrap",
                overflow: "visible",
                textShadow,
                writingMode: "vertical-rl",
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.06)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            >
              {p === 0.5 ? '.5' : p}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
      {/* Barbell load graphic */}
      <div style={{
        position: "relative",
        height: 88,
        background: "rgba(255,255,255,0.015)",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}>
        {/* Central Shaft */}
        <div style={{
          position: "absolute",
          left: "35%",
          right: "35%",
          height: 4,
          background: "linear-gradient(180deg, #94A3B8, #475569)",
          borderRadius: 1,
        }} />

        {/* Left Sleeve (where plates go) */}
        <div style={{
          position: "absolute",
          left: "8%",
          width: "27%",
          height: 8,
          background: "linear-gradient(180deg, #CBD5E1, #94A3B8)",
          borderRadius: "2px 0 0 2px",
        }} />

        {/* Right Sleeve (where plates go) */}
        <div style={{
          position: "absolute",
          right: "8%",
          width: "27%",
          height: 8,
          background: "linear-gradient(180deg, #CBD5E1, #94A3B8)",
          borderRadius: "0 2px 2px 0",
        }} />

        {/* Left Collar Sleeve Stop */}
        <div style={{
          position: "absolute",
          left: "35%",
          width: 3,
          height: 16,
          background: "#475569",
          borderRadius: 1,
        }} />

        {/* Right Collar Sleeve Stop */}
        <div style={{
          position: "absolute",
          right: "35%",
          width: 3,
          height: 16,
          background: "#475569",
          borderRadius: 1,
        }} />

        {/* Left sleeve loaded plates (inside out: right to left) */}
        {renderSleeve("left")}

        {/* Right sleeve loaded plates (inside out: left to right) */}
        {renderSleeve("right")}

        {/* Central Display Bubble */}
        <div style={{
          position: "absolute",
          background: "rgba(11,15,20,0.9)",
          border: `1px solid rgba(255,255,255,0.08)`,
          borderRadius: 8,
          padding: "4px 10px",
          fontFamily: T.mono,
          fontSize: 13,
          fontWeight: 800,
          color: T.strong,
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          pointerEvents: "none",
        }}>
          {weight} <span style={{ color: T.faint, fontSize: 10, fontWeight: 500 }}>lb</span>
        </div>
      </div>

      {/* Plate Loader buttons row */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.6 }}>
            ADD PLATES (PER SIDE)
          </span>
          {loadedPlates.length > 0 && (
            <button
              onClick={handleClear}
              style={{
                background: "transparent",
                border: 0,
                color: T.red,
                fontFamily: T.mono,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.4,
                cursor: "pointer",
                padding: "2px 4px",
              }}
            >
              RESET TO BAR (45LB)
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, justifyContent: "space-between" }}>
          {PLATE_SIZES.map(p => {
            const label = p === 0.5 ? '.5' : p;
            return (
              <button
                key={p}
                onClick={() => handleAddPlate(p)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 72,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  borderRadius: 8,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 120ms ease",
                  padding: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  const inner = e.currentTarget.querySelector('.inner-plate');
                  if (inner) inner.style.transform = "scale(1.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)";
                  const inner = e.currentTarget.querySelector('.inner-plate');
                  if (inner) inner.style.transform = "scale(1)";
                }}
              >
                <div
                  className="inner-plate"
                  style={{
                    width: B_WIDTHS[p],
                    height: B_HEIGHTS[p],
                    background: PLATE_COLORS[p].bg,
                    color: PLATE_COLORS[p].text,
                    fontSize: p >= 25 ? 14 : p >= 10 ? 12.5 : 11,
                    fontWeight: 900,
                    fontFamily: T.mono,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 2,
                    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    transition: "transform 100ms",
                    whiteSpace: "nowrap",
                    overflow: "visible",
                    textShadow: PLATE_COLORS[p].text === "#1E293B"
                      ? "0 0 2px #fff, 0 0 2px #fff, 0 0 2px #fff"
                      : "0 0 2.5px #000, 0 0 2.5px #000, 0 0 2.5px #000",
                  }}
                >
                  {label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── file: workout-session-strengthlevel.js ───

// Upload a finished session to Strength Level (my.strengthlevel.com).
//
// Strength Level's write API is session-cookie + same-origin only, so this app
// (a different origin) cannot POST to it directly. Instead the button builds a
// self-contained bookmarklet with the workout embedded; run it in a logged-in
// my.strengthlevel.com tab and it performs the create -> populate calls.
//
// See STRENGTHLEVEL_API.md for the reverse-engineered contract. This is an
// unofficial API; automated use is against Strength Level's ToS.

const LB_TO_KG = 0.45359237;

// Program exercise name -> Strength Level catalog exercise_id.
// Resolved against the live catalog (GET /api/exercises). ⚠ rows are the
// closest sensible match where no exact equivalent exists.
const SL_EXERCISE_MAP = {
  "Barbell Bench Press": "014b6a3d-a9a8-7249-a366-57858b8f510b",
  "Dumbbell Flat Bench Press": "015ae8ce-4a70-74dc-b935-40c38d951800",
  "Incline Barbell Press": "015df666-1ae8-7d63-a1f7-024a3a81c9df",
  "Incline Dumbbell Press": "016040da-ac68-76a9-ab62-ae8ffd8464bd",
  "Barbell Back Squat": "014b6a3d-b560-7ef2-8ecd-5575d15dce9d",
  "Goblet Squat": "0164ae2c-76f8-7da1-b808-615f7c4e6e42",
  "Bulgarian Split Squat": "0164ae2c-28d8-72a7-ada7-e0d86ef38c9c",
  "Lunges": "0164ae2c-6370-7313-8fe9-a2fb8fe544da",
  "Barbell RDL": "015c1754-6978-733e-812c-b6e9397d3864",
  "Dumbbell Romanian Deadlift": "0164ae2c-d8a0-73db-8934-0a30d166c7d3",
  "Single-Leg DB RDL": "016c62ab-8e50-7022-ad5a-c88c0fc9e9d5",
  "Band Romanian Deadlift": "015c1754-6978-733e-812c-b6e9397d3864", // ⚠ band→barbell
  "Band Squat": "014b6a3d-b560-7ef2-8ecd-5575d15dce9d", // ⚠ band→barbell
  "Standing Overhead Press": "0164ae2c-8a80-7947-a8ef-44661037202f",
  "Seated Overhead Press": "016df687-c908-7a50-852c-0e8aef0f7d6e",
  "Overhead Dumbbell Press": "015ae8cd-11f0-77fd-9092-bdf8bf43c627",
  "Dumbbell Lateral Raises": "015c1758-93e0-792c-987d-e2cbc635afa9",
  "Single-Arm Cable Lateral Raise": "0164ae2c-c130-7e82-a5ef-305397024b0e",
  "Reverse Flyes": "0164ae2c-9638-70ad-acbe-62093c04743c",
  "Cable Face Pulls": "0164ae2c-4430-7e27-be36-53b411f8088e",
  "Face Pulls": "0164ae2c-4430-7e27-be36-53b411f8088e",
  "Bent-Over Barbell Rows": "01502a1c-09a0-7cf9-ace6-47810571c38a",
  "Dumbbell Bent-Over Rows": "015ae8cd-0a20-7cc4-88b4-cd9f407b842e",
  "Single-Arm Dumbbell Rows": "015ae8cd-0a20-7cc4-88b4-cd9f407b842e",
  "Band Row": "0164ae2c-2108-7f95-8da0-46be2d687fcf", // ⚠ band→cable
  "Pull-Ups": "0158c933-b558-7d76-8c30-1e4c9944e224", // ⚠ logged as bodyweight
  "Dips": "0158c933-b940-765a-8e91-da5b2c9ffbb5",
  "Dumbbell Bicep Curls": "015ae8cd-0e08-77d2-8267-84afb69ad410",
  "Incline DB Curls": "0164ae2c-7ec8-7ae6-944c-86527fec8ac5",
  "Dumbbell Hammer Curls": "0164ae2c-1550-7e24-823c-e75abb78e4d2",
  "Band Bicep Curls": "015ae8cd-0e08-77d2-8267-84afb69ad410", // ⚠ band→dumbbell
  "Cable Tricep Pushdowns": "016040e0-8098-770d-8e50-e1b7c9732731",
  "Band Tricep Pushdowns": "016040e0-8098-770d-8e50-e1b7c9732731", // ⚠ band→cable
  "Overhead Tricep Extension": "016040d9-9ee0-73c7-b5cd-3c89fe16eebc",
  "Barbell Shrugs": "015df664-1f18-75fb-974e-fc745a6d58f1",
  "Dumbbell Shrugs": "015df666-1700-7bdc-980b-31ecdec839ab",
  "Calf Raises": "016c62ab-9a08-7b20-ac4e-76c77efe8995", // ⚠ bodyweight variant
  "Hanging Knee Raise": "016c62ac-3260-7f3c-80bf-e564325d600a",
  "Pallof Press": "017ca55f-0f78-737d-86d2-b4723925d23c",
  "Band Torso Rotation": "017ca55f-0b90-7e8b-be71-8a5379b790ff", // ⚠ band→cable
  "Cable Torso Rotation": "017ca55f-0b90-7e8b-be71-8a5379b790ff",
};

// Effective lifted weight in lb for one set, mirroring serializeForSave().
function _setWeightLb(ex, s) {
  const bandSum = (s.bands || []).reduce((a, b) => a + b, 0);
  if (ex.assist) return 0; // assisted/bodyweight → log as bodyweight (0 added) on SL
  if (ex.isBandsOnly) return bandSum;
  if (ex.bandAddon) return (s.weight || 0) + bandSum;
  return s.weight || 0;
}

// Turn the live `exercises` state into Strength Level's exercises[] payload.
// Returns { name, date, exercises, setCount, unmapped, mappedCount }.
function buildStrengthLevelPayload(exercises, workoutName, sessionDate) {
  const out = [];
  const unmapped = [];
  let setCount = 0;

  // Current bodyweight (the app tracks it in lb) → kg, so the upload can stamp
  // the right weight instead of letting Strength Level fall back to a stale
  // entry in its own bodyweight log.
  let bodyweightKg = null;
  try {
    const lb = (typeof loadBodyweight === "function" ? loadBodyweight() : null)
      || (typeof window !== "undefined" && window.USER_SETTINGS && parseFloat(window.USER_SETTINGS.bodyweight))
      || null;
    if (lb) bodyweightKg = Math.round(lb * LB_TO_KG * 10) / 10;
  } catch (e) {}

  (exercises || []).forEach(ex => {
    if (ex.skipped) return;
    const done = (ex.sets || []).filter(s => s.completed && parseInt(s.reps) > 0);
    if (!done.length) return;
    const id = SL_EXERCISE_MAP[ex.name];
    if (!id) {
      if (!unmapped.includes(ex.name)) unmapped.push(ex.name);
      return;
    }
    const sets = done.map(s => ({
      weight: Math.round(_setWeightLb(ex, s) * LB_TO_KG * 10) / 10,
      reps: parseInt(s.reps),
      rpe: null,
      notes: null,
      warmup: s.kind === "warmup",
      dropset: false,
      rest: null,
    }));
    setCount += sets.length;
    out.push({ exercise_id: id, sets });
  });
  return {
    name: workoutName || "Workout",
    date: sessionDate,
    exercises: out,
    bodyweightKg,
    setCount,
    mappedCount: out.length,
    unmapped,
  };
}

// Build a javascript: bookmarklet that, run on my.strengthlevel.com while
// logged in, creates the workout (POST) and populates it (PUT).
function buildStrengthLevelBookmarklet(payload) {
  const embedded = JSON.stringify({
    name: payload.name,
    date: payload.date,
    exercises: payload.exercises,
    bodyweightKg: payload.bodyweightKg,
  });
  const runner = function (W) {
    return (async () => {
      try {
        const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
        const off = new Date().getTimezoneOffset();
        const who = await fetch("/api/user", { headers: { Accept: "application/json" } });
        if (who.status !== 200) { alert("Not logged into Strength Level. Log in at my.strengthlevel.com, then run this again."); return; }
        const uid = (await who.json()).data.id;
        const cr = await fetch("/api/workouts", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ user_id: uid, name: W.name, date: W.date, start_at: null, finish_at: null, timezone: tz, timezone_offset_mins: off }),
        });
        if (!cr.ok) { alert("Create failed (HTTP " + cr.status + ")."); return; }
        const crd = (await cr.json()).data;
        const id = crd.id;
        const g = await fetch("/api/workouts/" + id + "?user_id=" + uid + "&workout.fields=etag", { headers: { Accept: "application/json" } });
        let etag = g.headers.get("ETag");
        if (!etag) { try { etag = (await g.json()).data.etag; } catch (e) {} }
        const now = new Date();
        const doc = {
          id: id, version: 1, date: W.date, name: W.name, timezone: tz, timezone_offset_mins: off,
          created_at: crd.created_at || now.toISOString(), updated_at: now.toISOString(), updated_at_ms: now.getTime(),
          exercises: W.exercises, etag: etag,
        };
        const headers = { "Content-Type": "application/json", Accept: "application/json" };
        if (etag) headers["If-Match"] = etag;
        const pu = await fetch("/api/workouts/" + id, { method: "PUT", headers: headers, body: JSON.stringify(doc) });
        if (!pu.ok) { alert("Populate failed (HTTP " + pu.status + "). Empty workout " + id + " was created — delete it if needed."); return; }
        // Stamp bodyweight for this date if the log has no entry for it yet
        // (never overwrite a manually-logged weigh-in).
        let bwNote = "";
        if (W.bodyweightKg) {
          try {
            const bwLog = await (await fetch("/api/bodyweights?user_id=" + uid + "&limit=50", { headers: { Accept: "application/json" } })).json();
            const exists = (bwLog.data || []).some(b => b.date === W.date);
            if (!exists) {
              const bwr = await fetch("/api/bodyweights", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ user_id: uid, date: W.date, bodyweight: W.bodyweightKg }) });
              bwNote = bwr.ok ? "\nBodyweight " + W.bodyweightKg + " kg logged." : "\n(Bodyweight log failed — set it manually.)";
            } else {
              bwNote = "\n(Bodyweight already logged for " + W.date + ".)";
            }
          } catch (e) { bwNote = "\n(Bodyweight step errored.)"; }
        }
        alert("✅ Uploaded \"" + W.name + "\" (" + W.exercises.length + " exercises) to Strength Level." + bwNote + "\nRefresh your workouts page to see it.");
      } catch (e) { alert("Sync error: " + (e && e.message ? e.message : e)); }
    })();
  };
  return "javascript:(" + runner.toString() + ")(" + embedded + ");void 0;";
}

function StrengthLevelUpload({ exercises, workoutName, sessionDate }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const payload = useMemo(
    () => buildStrengthLevelPayload(exercises, workoutName, sessionDate),
    [exercises, workoutName, sessionDate]
  );
  const bookmarklet = useMemo(() => buildStrengthLevelBookmarklet(payload), [payload]);

  const copy = () => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(bookmarklet).then(done).catch(() => {});
    }
  };

  const nothing = payload.mappedCount === 0;

  return (
    <React.Fragment>
      <button
        onClick={() => { setOpen(true); copy(); }}
        style={{
          width: "100%", maxWidth: 320, background: "transparent",
          border: `1px solid ${T.cardBorder}`, color: T.text,
          fontFamily: "inherit", fontSize: 14, fontWeight: 700,
          padding: "11px 0", borderRadius: 11, cursor: "pointer",
        }}>
        ⬆ Upload to Strength Level
      </button>

      {open && createPortal(
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 460, background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 22, color: T.text, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: T.strong, fontSize: 17, fontWeight: 800 }}>Upload to Strength Level</h3>
              <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: T.accentLight, fontSize: 16, cursor: "pointer" }}>✕</button>
            </div>

            {nothing ? (
              <p style={{ color: T.amber, fontSize: 13, lineHeight: 1.5, margin: "0 0 8px" }}>
                No completed, mappable exercises to upload yet.
              </p>
            ) : (
              <p style={{ color: T.muted, fontSize: 13, lineHeight: 1.5, margin: "0 0 4px" }}>
                Prepared <b style={{ color: T.strong }}>{payload.mappedCount}</b> exercise{payload.mappedCount !== 1 ? "s" : ""} · <b style={{ color: T.strong }}>{payload.setCount}</b> sets for <b style={{ color: T.strong }}>{payload.date}</b>. Weights converted lb → kg{payload.bodyweightKg ? `; bodyweight ${payload.bodyweightKg} kg` : ""}.
              </p>
            )}
            {payload.unmapped.length > 0 && (
              <p style={{ color: T.faint, fontSize: 11.5, lineHeight: 1.5, margin: "6px 0 0" }}>
                Skipped (no Strength Level match): {payload.unmapped.join(", ")}
              </p>
            )}

            {!nothing && (
              <React.Fragment>
                <div style={{ marginTop: 16, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.cardBorder}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ color: T.faint, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>HOW TO RUN {copied ? "· COPIED ✓" : ""}</div>
                  <ol style={{ margin: 0, paddingLeft: 18, color: T.muted, fontSize: 12.5, lineHeight: 1.6 }}>
                    <li>Open <b style={{ color: T.text }}>my.strengthlevel.com</b> in a tab and make sure you're logged in.</li>
                    <li>Open that tab's DevTools <b style={{ color: T.text }}>Console</b> (⌥⌘J), paste the copied snippet, press Enter. (First time, Chrome may ask you to type <i>allow pasting</i>.)</li>
                    <li>A confirmation alert appears; refresh your workouts page.</li>
                  </ol>
                </div>
                <button
                  onClick={copy}
                  style={{ width: "100%", marginTop: 12, background: `linear-gradient(180deg, ${T.accentLight}, ${T.accent})`, border: "none", color: T.inv, fontFamily: "inherit", fontSize: 14, fontWeight: 700, padding: "11px 0", borderRadius: 10, cursor: "pointer" }}>
                  {copied ? "Copied to clipboard ✓" : "Copy sync snippet"}
                </button>
                <textarea
                  readOnly
                  value={bookmarklet}
                  onFocus={e => e.target.select()}
                  style={{ width: "100%", marginTop: 10, height: 70, background: "rgba(0,0,0,0.25)", border: `1px solid ${T.cardBorder}`, borderRadius: 8, color: T.faint, fontFamily: T.mono, fontSize: 10, padding: 8, resize: "vertical" }}
                />
                <p style={{ color: T.faint, fontSize: 10.5, lineHeight: 1.5, margin: "10px 0 0" }}>
                  Note: this uses Strength Level's unofficial API and is against their Terms of Service. It uploads only your own data.
                </p>
              </React.Fragment>
            )}
          </div>
        </div>,
        document.body
      )}
    </React.Fragment>
  );
}

if (typeof window !== "undefined") {
  window.SL_EXERCISE_MAP = SL_EXERCISE_MAP;
  window.buildStrengthLevelPayload = buildStrengthLevelPayload;
  window.buildStrengthLevelBookmarklet = buildStrengthLevelBookmarklet;
  window.StrengthLevelUpload = StrengthLevelUpload;
}

// ─── file: workout-session-complete-screen.js ───

function WorkoutCompleteScreen({ workoutName, elapsedSec, totalSets, exercises, sessionDate, onFinish }) {
  const m = Math.floor(elapsedSec / 60);
  const s = String(elapsedSec % 60).padStart(2, "0");

  return (
    <div style={{
      margin: "0 16px 12px",
      padding: "32px 24px",
      background: T.cardBg,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: 16,
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 20,
      boxShadow: "0 10px 30px -8px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02)"
    }}>
      <div style={{ fontSize: 48 }}>🎉</div>
      <h2 style={{
        margin: 0,
        color: T.strong,
        fontSize: 26,
        fontWeight: 800,
        letterSpacing: -0.5,
      }}>
        Workout Complete!
      </h2>
      <p style={{
        margin: 0,
        color: T.muted,
        fontSize: 14,
        lineHeight: 1.5,
        maxWidth: 280,
      }}>
        Awesome effort today! Your workout has been saved to your history.
      </p>

      {/* Stats Box */}
      <div style={{
        width: "100%",
        maxWidth: 320,
        background: "rgba(255,255,255,0.015)",
        border: `1px solid rgba(255,255,255,0.04)`,
        borderRadius: 12,
        padding: "16px 20px",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        margin: "10px 0",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: T.faint, fontSize: 10, fontWeight: 700, fontFamily: T.mono, letterSpacing: 0.6 }}>TIME</span>
          <span style={{ color: T.strong, fontSize: 20, fontWeight: 800, fontFamily: T.mono }}>{m}:{s}</span>
        </div>
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: T.faint, fontSize: 10, fontWeight: 700, fontFamily: T.mono, letterSpacing: 0.6 }}>SETS</span>
          <span style={{ color: T.strong, fontSize: 20, fontWeight: 800, fontFamily: T.mono }}>{totalSets}</span>
        </div>
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: T.faint, fontSize: 10, fontWeight: 700, fontFamily: T.mono, letterSpacing: 0.6 }}>WORKOUT</span>
          <span style={{ color: T.strong, fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>{workoutName}</span>
        </div>
      </div>

      <button
        onClick={onFinish}
        style={{
          width: "100%",
          maxWidth: 320,
          background: `linear-gradient(180deg, ${T.accentLight}, ${T.accent})`,
          border: "none",
          color: T.inv,
          fontFamily: "inherit",
          fontSize: 15,
          fontWeight: 700,
          padding: "12px 0",
          borderRadius: 11,
          cursor: "pointer",
          boxShadow: `0 4px 16px -4px ${T.accent}`,
          transition: "transform 150ms",
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.02)"}
        onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
      >
        Finish & Exit
      </button>

      {/* A deload single (1×1 @ 80%) isn't meaningful Strength Level data. */}
      {window.StrengthLevelUpload && !window.SESSION_DELOAD && (
        <StrengthLevelUpload
          exercises={exercises}
          workoutName={workoutName}
          sessionDate={sessionDate} />
      )}
    </div>
  );
}

// ─── file: workout-session-motivation-payload.js ───

function buildMotivatePayload(exercise, sid, sessionDate, history, statHistory) {
  const subNames = [exercise.name];
  const today = sessionDate;
  const todayMs = Date.parse(today + 'T00:00:00Z');

  const current = [];
  exercise.sets.forEach(s => {
    if (!s.completed) return;
    const bandSum = (s.bands || []).reduce((a, b) => a + b, 0);
    let weight_lb;
    if (exercise.assist) {
      weight_lb = Math.max(0, (s.bodyweight || 0) - bandSum);
    } else if (exercise.isBandsOnly) {
      weight_lb = bandSum;
    } else if (exercise.bandAddon) {
      weight_lb = (s.weight || 0) + bandSum;
    } else {
      weight_lb = s.weight || 0;
    }
    current.push({
      sub: exercise.name,
      type: s.kind === "warmup" ? "warmup" : "working",
      set_number: s.setNumber,
      reps: parseInt(s.reps) || 0,
      weight_lb,
    });
  });

  const previous = [];
  for (const sess of (history || []).slice(0, 4)) {
    const sessSets = (sess.sets || []).filter(st => subNames.includes(st.exercise));
    if (sessSets.length) previous.push({
      date: sess.date,
      sets: sessSets.map(st => ({ sub: st.exercise, type: st.set_type, reps: st.reps, weight_lb: st.weight_lb })),
    });
    if (previous.length >= 2) break;
  }

  const muscles = [];
  subNames.forEach(name => {
    const m = EXERCISE_MUSCLES[name];
    if (m) muscles.push(...(m.primary || []), ...(m.secondary || []));
  });

  const statsLoaded = Object.keys(statHistory.orm || {}).length > 0;
  const ormOf = (w, r) => r > 1 ? w * (1 + r / 30) : w;

  const prs = subNames.map(subName => {
    const histSessions = (history || []).filter(s =>
      (s.sets || []).some(st => st.exercise === subName && st.set_type === 'working')
    );
    let histMaxWt = 0, histMaxReps = 0, histMaxOrm = 0;
    const histByDate = {};
    histSessions.forEach(sess => {
      let mw = 0, mr = 0, mo = 0, sv = 0;
      sess.sets.forEach(st => {
        if (st.exercise !== subName || st.set_type !== 'working') return;
        const w = +st.weight_lb || 0;
        const r = parseInt(st.reps) || 0;
        if (w > mw) mw = w; if (mw > histMaxWt) histMaxWt = mw;
        if (r > mr) mr = r; if (mr > histMaxReps) histMaxReps = mr;
          const o = calcSet1RM(subName, w, r, st.bands_json, st.grip);
          if (o > mo) mo = o;
          if (mo > histMaxOrm) histMaxOrm = mo;
          sv += w * r;
      });
      histByDate[sess.date] = { date: sess.date, orm: mo, wt: mw, reps: mr, vol: sv };
    });

    const ormHist  = ((statHistory.orm  || {})[subName] || []);
    const wtHist   = ((statHistory.wt   || {})[subName] || []);
    const repsHist = ((statHistory.reps || {})[subName] || []);
    const volHist  = ((statHistory.vol  || {})[subName] || []);
    const statMaxOrm  = ormHist.length  ? Math.max(...ormHist.map(d => +d.orm  || 0)) : 0;
    const statMaxWt   = wtHist.length   ? Math.max(...wtHist.map(d => +d.wt    || 0)) : 0;
    const statMaxReps = repsHist.length ? Math.max(...repsHist.map(d => +d.reps|| 0)) : 0;
    const byDate = { ...histByDate };
    ormHist.forEach (d => { (byDate[d.date] = byDate[d.date] || { date: d.date }).orm  = +d.orm  || 0; });
    wtHist.forEach  (d => { (byDate[d.date] = byDate[d.date] || { date: d.date }).wt   = +d.wt   || 0; });
    repsHist.forEach(d => { (byDate[d.date] = byDate[d.date] || { date: d.date }).reps = +d.reps || 0; });
    volHist.forEach (d => { (byDate[d.date] = byDate[d.date] || { date: d.date }).vol  = +d.vol  || 0; });

    const prevMaxOrm  = Math.max(histMaxOrm,  statMaxOrm);
    const prevMaxWt   = Math.max(histMaxWt,   statMaxWt);
    const prevMaxReps = Math.max(histMaxReps, statMaxReps);
    const allHist = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

    if (allHist.length === 0) return null;

    const workingSets = exercise.sets.filter(s => s.kind === "work" && s.completed);
    const curWt   = workingSets.reduce((m, s) => Math.max(m, (() => {
      const bs = (s.bands || []).reduce((a, b) => a + b, 0);
      return exercise.assist ? Math.max(0, (s.bodyweight || 0) - bs)
           : exercise.isBandsOnly ? bs
           : exercise.bandAddon ? (s.weight || 0) + bs
           : (s.weight || 0);
    })()), 0);
    const curReps = workingSets.reduce((m, s) => Math.max(m, parseInt(s.reps) || 0), 0);
    const curOrm  = workingSets.reduce((m, s) => {
      const reps = parseInt(s.reps) || 0;
      const bs = (s.bands || []).reduce((a, b) => a + b, 0);
      const w = exercise.assist ? Math.max(0, (s.bodyweight || 0) - bs)
              : exercise.isBandsOnly ? bs
              : exercise.bandAddon ? (s.weight || 0) + bs
              : (s.weight || 0);
      const isAssist = exercise.assist;
      const o = isAssist ? (reps > 1 ? (w * reps / 30.0) - bs : -bs) : ormOf(w, reps);
      return reps > 0 && w > 0 ? Math.max(m, o) : m;
    }, 0);
    const curVol = workingSets.reduce((sum, s) => {
      const reps = parseInt(s.reps) || 0;
      const bs = (s.bands || []).reduce((a, b) => a + b, 0);
      const w = exercise.assist ? Math.max(0, (s.bodyweight || 0) - bs)
              : exercise.isBandsOnly ? bs
              : exercise.bandAddon ? (s.weight || 0) + bs
              : (s.weight || 0);
      return sum + (reps > 0 && w > 0 ? w * reps : 0);
    }, 0);

    const trimmed = allHist.slice(-12);

    const lastDate = allHist[allHist.length - 1].date;
    const daysSinceLast = Math.round((todayMs - Date.parse(lastDate + 'T00:00:00Z')) / 86400000);
    const recent = allHist.filter(h => todayMs - Date.parse(h.date + 'T00:00:00Z') <= 28 * 86400000);
    const prior  = allHist.filter(h => {
      const ago = todayMs - Date.parse(h.date + 'T00:00:00Z');
      return ago > 28 * 86400000 && ago <= 56 * 86400000;
    });
    const avg = arr => arr.length ? arr.reduce((s, x) => s + (+x.vol || 0), 0) / arr.length : 0;
    const recentAvg = avg(recent), priorAvg = avg(prior);
    const volTrendPct = priorAvg > 0 ? Math.round((recentAvg - priorAvg) / priorAvg * 100) : null;

    const sameWtReps = curWt > 0 ? allHist.filter(h => h.wt === curWt).map(h => h.reps).filter(r => r > 0) : [];
    const repsAtCurWtImproved = sameWtReps.length >= 2 && curReps > Math.max(...sameWtReps);

    return {
      sub: subName,
      current_orm: curOrm,           previous_best_orm: prevMaxOrm,    is_orm_pr:    !!(curOrm && curOrm > prevMaxOrm),
      current_max_weight: curWt,     previous_best_weight: prevMaxWt,  is_weight_pr: !!(curWt && curWt > prevMaxWt),
      current_max_reps: curReps,     previous_best_reps: prevMaxReps,  is_reps_pr:   !!(curReps && curReps > prevMaxReps),
      current_volume: curVol,
      sessions_in_history: allHist.length,
      days_since_last_session: daysSinceLast,
      returning_after_layoff: daysSinceLast >= 14,
      vol_trend_pct_4wk_vs_prior: volTrendPct,
      reps_at_current_weight_improved: repsAtCurWtImproved,
      tied_previous_best_orm: !!(curOrm && prevMaxOrm && curOrm === prevMaxOrm),
      history_timeseries: trimmed,
      stats_source: statsLoaded ? "full" : "recent_history_only",
    };
  }).filter(Boolean);

  const statsFailed = !statsLoaded;

  return {
    session_id: sid,
    exercise: exercise.name,
    muscles: [...new Set(muscles)],
    stats_loaded: !statsFailed,
    current,
    previous,
    prs,
  };
}

async function requestMotivation(exercise, sid, sessionDate, history, statHistory, setMotivations) {
  setMotivations(m => ({ ...m, [exercise.id]: "__loading__" }));
  try {
    const payload = buildMotivatePayload(exercise, sid, sessionDate, history, statHistory);
    const res = await api.motivate(payload);
    if (res && res.message) {
      setMotivations(m => ({ ...m, [exercise.id]: res.message }));
    } else {
      setMotivations(m => { const c = { ...m }; delete c[exercise.id]; return c; });
    }
  } catch (e) {
    console.warn("[V2-MOTIVATE]", e);
    setMotivations(m => { const c = { ...m }; delete c[exercise.id]; return c; });
  }
}

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
    updateAndSave(patchSet(eIdx, sIdx, { grip: g }));
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
    let next = patchSet(eIdx, sIdx, { reps: r, completed: true, logged_at: new Date().toISOString() });

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

      const restKind = (nextSet && nextSet.kind === "warmup") ? "warmup" : "work";
      const total = restKind === "warmup" ? 30 : (ex.rest || 90);
      setRest({ total, left: total, endAt: Date.now() + total * 1000, eIdx, sIdx, kind: restKind, paused: false });
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
    const payload = serializeForSave(exercises, workout.name, sessionId, startedAt, elapsedSec, sessionDate);
    api.save(payload).finally(() => {
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

// ─── file: workout-session-activeset.js ───

// BarbellVisualizer component has been extracted to its own file: /workout-session-barbell-visualizer.js

function ActiveSetBlock({ exercise, set, totalWork, totalWarmup, warmupPos, onPickWeight, onPickBodyweight, onPickGrip, onToggleBand, onClearBands, onLogReps, onSkipWarmup, onApplyLast }) {
  const isBW = exercise.mode === "bodyweight";
  const bands = set.bands || [];
  const lastBands = set.lastBands || [];
  const baseW = isBW ? (set.bodyweight || 0) : set.weight;
  const lastBaseW = isBW ? (set.lastBodyweight || 0) : (set.lastWeight || 0);
  const bandTotal = bands.reduce((a, b) => a + b, 0);
  const lastBandTotal = lastBands.reduce((a, b) => a + b, 0);
  const lastTotal = isBW ? Math.max(0, lastBaseW - lastBandTotal) : (lastBaseW + lastBandTotal);

  const stages = exercise.stages || null;
  const matchesLast = stages
    ? (set.lastReps != null && set.grip === set.lastGrip)
    : (set.lastReps != null) &&
      baseW === lastBaseW &&
      (!exercise.grips || set.grip === set.lastGrip) &&
      bands.length === lastBands.length &&
      bands.every(b => lastBands.includes(b));

  const hasLast = set.lastWeight != null || set.lastBodyweight != null || set.lastReps != null;
  const range = (() => {
    const m = String(exercise.repRange || "").match(/(\d+)\D+(\d+)/);
    return m ? [parseInt(m[1]), parseInt(m[2])] : null;
  })();

  return (
    <div style={{
      borderRadius: 12,
      background: "linear-gradient(180deg, rgba(59,130,246,0.08), rgba(17,24,39,0.55))",
      boxShadow: "0 0 0 1px rgba(96,165,250,0.35), 0 8px 24px -8px rgba(59,130,246,0.4)",
      padding: "14px 14px 16px",
      marginTop: 14, marginBottom: 6,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
        {set.kind === "warmup" ? (
          <span style={{ color: T.amber, fontWeight: 700, fontSize: 17, letterSpacing: -0.2 }}>
            Warm-up
            {totalWarmup > 1 && (
              <>
                <span style={{ fontFamily: T.mono }}> {warmupPos}</span>
                <span style={{ color: T.faint, fontWeight: 500 }}> of {totalWarmup}</span>
              </>
            )}
          </span>
        ) : (
          <span style={{ color: T.strong, fontWeight: 700, fontSize: 17, letterSpacing: -0.2 }}>
            Set <span style={{ fontFamily: T.mono }}>{set.idx}</span>
            {totalWork > 0 && <span style={{ color: T.faint, fontWeight: 500 }}> of {totalWork}</span>}
          </span>
        )}
      </div>

      {hasLast && (
        <button
          onClick={onApplyLast}
          disabled={matchesLast}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 10, padding: "9px 12px",
            background: matchesLast ? "rgba(96,165,250,0.08)" : "rgba(59,130,246,0.06)",
            border: matchesLast ? "1px solid rgba(96,165,250,0.35)" : "1px dashed rgba(96,165,250,0.45)",
            borderRadius: 10,
            cursor: matchesLast ? "default" : "pointer",
            color: T.accentLight, marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, fontFamily: T.mono, opacity: 0.75 }}>LAST</span>
            <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: "#DBEAFE" }}>
              {stages ? (stageLabel(stages, set.lastGrip) || "—") : (lastBaseW || "—")}
              {!stages && lastBands.length > 0 && (
                <span style={{ color: T.bands }}> {isBW ? "−" : "+"} {lastBands.join("+")}</span>
              )}
              <span style={{ color: T.faint, fontWeight: 500 }}> × </span>
              {set.lastReps || "—"}
              {!stages && isBW && set.lastGrip && <span style={{ color: T.muted, fontWeight: 500 }}> · {GRIP_LABELS[set.lastGrip]?.label || set.lastGrip}</span>}
            </span>
            {lastBandTotal > 0 && (
              <span style={{ color: T.faint, fontFamily: T.mono, fontSize: 11 }}>({lastTotal}lb)</span>
            )}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, opacity: matchesLast ? 0.7 : 1 }}>
            {matchesLast ? "✓ matched" : "use last"}
          </span>
        </button>
      )}

      {exercise.grips && (
        <GripSelector
          grips={exercise.grips}
          selected={set.grip}
          last={set.lastGrip}
          onPick={onPickGrip}
        />
      )}

      {stages && (
        <StageSelector
          stages={stages}
          selected={set.grip}
          last={set.lastGrip}
          onPick={onPickGrip}
        />
      )}

      {!exercise.isBandsOnly && !stages && (
        <WeightStepper
          value={baseW}
          last={lastBaseW || null}
          onPick={isBW ? onPickBodyweight : onPickWeight}
          label={isBW ? "BODYWEIGHT" : null}
          isCable={exercise.equipment === "cable" || exercise.name.toLowerCase().includes("cable")}
        />
      )}

      {!isBW && exercise.isBarbell && (
        <BarbellVisualizer
          weight={baseW || 45}
          onWeightChange={onPickWeight}
        />
      )}

      {(exercise.isBandsOnly || exercise.bandAddon || (exercise.assist && exercise.equipment === "band")) && (
        <BandsGrid
          bands={bands}
          lastBands={lastBands}
          onToggle={onToggleBand}
          onClear={onClearBands}
          isAssist={exercise.assist}
        />
      )}

      <div style={{ marginTop: 14 }}>
        <RepStrip
          min={1} max={20}
          range={range}
          last={set.lastReps}
          logged={set.reps}
          onLog={onLogReps}
        />
      </div>

      {set.kind === "warmup" && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={onSkipWarmup} style={{
            background: "transparent", border: 0, color: "#A1A1AA",
            fontFamily: "inherit", fontWeight: 500, fontSize: 13, padding: "4px 0", cursor: "pointer",
          }}>Skip warmup →</button>
        </div>
      )}
    </div>
  );
}

// ─── file: workout-session-set-card.js ───

function setStripLabel(s, allSets) {
  if (s.kind === "warmup") {
    const warmups = allSets.filter(x => x.kind === "warmup");
    if (warmups.length > 1) {
      const n = warmups.indexOf(s) + 1;
      return `W${n}`;
    }
    return "WARM";
  }
  return `SET ${s.idx}`;
}

function SetCard({ s, idx, exercise, onReopenSet }) {
  const isBW = exercise.mode === "bodyweight";
  const isAssist = exercise.assist;
  const isBandsOnly = exercise.isBandsOnly;
  const baseW = isBW ? (s.bodyweight || 0) : (s.weight || 0);
  const lastBaseW = isBW ? (s.lastBodyweight || 0) : (s.lastWeight || 0);
  const bandSum = (s.bands || []).reduce((a, b) => a + b, 0);
  const lastBandSum = (s.lastBands || []).reduce((a, b) => a + b, 0);
  const totalLb = isAssist ? Math.max(0, baseW - bandSum) : (isBandsOnly ? bandSum : baseW + bandSum);
  const prev = isAssist ? Math.max(0, lastBaseW - lastBandSum) : (isBandsOnly ? lastBandSum : lastBaseW + lastBandSum);
  const stages = exercise.stages || null;
  // Staged exercise: the "weight" slot shows the stage (S1..Sn); deltas compare
  // stage rank first, then reps.
  const curRank = stages ? stageRank(stages, s.grip || s.lastGrip) : 0;
  const lastRank = stages ? stageRank(stages, s.lastGrip) : 0;
  const wDelta = stages ? (lastRank > 0 ? curRank - lastRank : 0) : totalLb - prev;
  const rDelta = s.lastReps != null && s.reps != null ? s.reps - s.lastReps : 0;
  const isFlat = wDelta === 0 && rDelta === 0;
  const isDown = wDelta < 0 || (wDelta === 0 && rDelta < 0);
  const deltaColor = isFlat ? T.faint : isDown ? T.red : T.green;
  const deltaText = !s.completed ? "" : isFlat ? "=" :
    wDelta !== 0 ? (stages ? `${wDelta > 0 ? "↑" : "↓"}S${curRank}` : `${wDelta > 0 ? "+" : ""}${wDelta}`) :
    `${rDelta > 0 ? "+" : ""}${rDelta}r`;
  const isWarm = s.kind === "warmup";
  const isCurrent = s.active;
  const tappable = !isCurrent;

  const btnRef = React.useRef(null);
  React.useEffect(() => {
    if (isCurrent && btnRef.current) {
      btnRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [isCurrent]);

  return (
    <button ref={btnRef} onClick={tappable ? () => onReopenSet(idx) : undefined} disabled={!tappable} style={{
      padding: "8px 4px 7px", borderRadius: 9,
      cursor: tappable ? "pointer" : "default",
      background: isCurrent
        ? (isWarm ? "rgba(217,119,6,0.12)" : "rgba(59,130,246,0.14)")
        : s.completed ? "rgba(255,255,255,0.03)" : "transparent",
      boxShadow: isCurrent
        ? (isWarm ? "0 0 0 1.5px rgba(251,191,36,0.55), 0 4px 14px -4px rgba(217,119,6,0.45)"
                  : "0 0 0 1.5px rgba(96,165,250,0.6), 0 4px 14px -4px rgba(59,130,246,0.5)")
        : "none",
      border: isCurrent ? "0" : `1px ${s.completed ? "solid" : "dashed"} rgba(255,255,255,0.05)`,
      opacity: isCurrent ? 1 : s.completed ? 1 : 0.45,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
      flex: "1 0 60px", flexShrink: 0, transition: "all 200ms ease",
    }}>
      <span style={{ color: isWarm ? T.amber : isCurrent ? T.accentLight : T.faint, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 0.7 }}>
        {setStripLabel(s, exercise.sets)}
      </span>
      {(() => {
        const isPreview = s.reps == null && s.lastReps != null;
        const repText = s.reps ?? s.lastReps ?? "—";
        const repColor = isPreview ? T.muted : (s.completed || isCurrent) ? T.strong : T.faint;
        return (
          <div style={{ display: "flex", alignItems: "baseline", gap: 2, fontFamily: T.mono }}>
            <span style={{ color: (s.completed || isCurrent) ? T.strong : T.faint, fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>{stages ? (curRank > 0 ? `S${curRank}` : "—") : totalLb}</span>
            <span style={{ color: T.disabled, fontSize: 11 }}>×</span>
            <span style={{ color: repColor, fontSize: 16, fontWeight: 700, letterSpacing: -0.3, fontStyle: isPreview ? "italic" : "normal" }}>{repText}</span>
          </div>
        );
      })()}
      {s.completed ? (
        <span style={{ color: deltaColor, fontFamily: T.mono, fontSize: 10, fontWeight: 700 }}>{deltaText}</span>
      ) : isCurrent ? (
        <span style={{ color: isWarm ? T.amber : T.accentLight, fontFamily: T.mono, fontSize: 10, fontWeight: 700 }}>● now</span>
      ) : (
        <span style={{ color: T.disabled, fontFamily: T.mono, fontSize: 10 }}>up next</span>
      )}
    </button>
  );
}

// ─── file: workout-session-stats-pane.js ───

const Section = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ color: T.muted, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 0.9, marginBottom: 8 }}>
      {label}
    </div>
    {children}
  </div>
);

const KV = ({ k, v }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 11, borderBottom: `1px solid ${T.cardBorder}` }}>
    <span style={{ color: T.faint, fontFamily: T.mono }}>{k}</span>
    <span style={{ color: T.strong, fontFamily: T.mono, fontWeight: 700 }}>{v}</span>
  </div>
);

function StatsPane({ exercise, history, statHistory, exercises }) {
  if (!exercise) return null;
  const today = localDate();
  const todayMs = Date.parse(today + 'T00:00:00Z');
  const sevenDaysAgoMs = todayMs - 7 * 86400000;
  
  const [tip, setTip] = useState(null);
  const showTip = (e, content) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ content, x: r.left + r.width / 2, y: r.top - 4 });
  };
  const hideTip = () => setTip(null);

  useEffect(() => {
    setTip(null);
  }, [exercise]);

  const muscleInfo = EXERCISE_MUSCLES[exercise.name] || { primary: [], secondary: [] };

  const muscleSets7d = {};
  (muscleInfo.primary || []).forEach(m => muscleSets7d[m] = []);
  (muscleInfo.secondary || []).forEach(m => muscleSets7d[m] = []);
  for (const sess of (history || [])) {
    if (!sess.date || sess.date === today) continue;
    const sessMs = Date.parse(sess.date + 'T00:00:00Z');
    if (sessMs <= sevenDaysAgoMs || sessMs > todayMs) continue;
    for (const st of (sess.sets || [])) {
      if (st.set_type !== 'working') continue;
      const mm = EXERCISE_MUSCLES[st.exercise];
      if (!mm) continue;
      for (const muscle of (mm.primary || [])) {
        if (muscle in muscleSets7d) muscleSets7d[muscle].push({
          date: sess.date, isToday: false,
          exercise: st.exercise,
          weight: +st.weight_lb || 0,
          reps: parseInt(st.reps) || 0,
          weightage: getMuscleImpact(st.exercise, muscle, true),
        });
      }
      for (const muscle of (mm.secondary || [])) {
        if (muscle in muscleSets7d) muscleSets7d[muscle].push({
          date: sess.date, isToday: false,
          exercise: st.exercise,
          weight: +st.weight_lb || 0,
          reps: parseInt(st.reps) || 0,
          weightage: getMuscleImpact(st.exercise, muscle, false),
        });
      }
    }
  }

  const chartTodayDate = new Date(todayMs).toISOString().slice(0, 10);
  for (const e of exercises) {
    const em = EXERCISE_MUSCLES[e.name];
    if (!em || e.skipped) continue;
    for (const s of e.sets) {
      if (!s.completed || s.kind !== 'work') continue;
      const bs = (s.bands || []).reduce((a, b) => a + b, 0);
      const weight = e.assist ? Math.max(0, (s.bodyweight || 0) - bs)
                    : e.isBandsOnly ? bs
                    : e.bandAddon ? (s.weight || 0) + bs
                    : (s.weight || 0);
      for (const muscle of (em.primary || [])) {
        if (muscle in muscleSets7d) muscleSets7d[muscle].push({
          date: chartTodayDate, isToday: true,
          exercise: e.name,
          weight,
          reps: parseInt(s.reps) || 0,
          weightage: getMuscleImpact(e.name, muscle, true),
        });
      }
      for (const muscle of (em.secondary || [])) {
        if (muscle in muscleSets7d) muscleSets7d[muscle].push({
          date: chartTodayDate, isToday: true,
          exercise: e.name,
          weight,
          reps: parseInt(s.reps) || 0,
          weightage: getMuscleImpact(e.name, muscle, false),
        });
      }
    }
  }

  Object.values(muscleSets7d).forEach(arr => arr.sort((a, b) => a.date.localeCompare(b.date)));

  const stat = statHistory || {};
  const lookupIsAssist = exercise.name === "Pull-Ups" || exercise.name === "Dips" || exercise.name === "Dead Hang + Scap Pulls" || exercise.name === "Hanging Knee Raise";
  const histByDate = {};
  (history || []).forEach(sess => {
    if (!sess.date) return;
    const sets = (sess.sets || []).filter(st => st.exercise === exercise.name && st.set_type === 'working');
    if (!sets.length) return;
    let mo = lookupIsAssist ? -Infinity : 0, sv = 0, mw = lookupIsAssist ? -Infinity : 0, mr = 0;
    sets.forEach(st => {
      const w = +st.weight_lb || 0, r = parseInt(st.reps) || 0;
      const orm = calcSet1RM(st.exercise || exercise.name, w, r, st.bands_json, st.grip);
      let bandSum = 0;
      if (lookupIsAssist && st.bands_json) {
        try {
          const b = JSON.parse(st.bands_json);
          if (Array.isArray(b)) bandSum = b.reduce((a, x) => a + (+x || 0), 0);
        } catch(e){}
      }
      const displayW = lookupIsAssist ? -bandSum : w;
      if (displayW > mw) mw = displayW;
      if (r > mr) mr = r;
      if (w > 0 && r > 0) {
        if (orm > mo) mo = orm;
        sv += w * r;
      }
    });
    histByDate[sess.date] = { date: sess.date, orm: mo === -Infinity ? 0 : mo, vol: sv, wt: mw === -Infinity ? 0 : mw, reps: mr };
  });

  const mergeMetric = (statArr, key) => {
    const byDate = {};
    (statArr || []).forEach(d => { byDate[d.date] = +d[key] || 0; });
    Object.values(histByDate).forEach(h => { byDate[h.date] = h[key]; });
    return Object.entries(byDate)
      .map(([date, v]) => ({ date, [key]: v }))
      .sort((a, b) => a.date.localeCompare(b.date));
  };
  const ormHistRaw = mergeMetric((stat.orm || {})[exercise.name], "orm");
  const wtHist     = mergeMetric((stat.wt  || {})[exercise.name], "wt");
  const repsHist   = mergeMetric((stat.reps|| {})[exercise.name], "reps");
  const volHistRaw = mergeMetric((stat.vol || {})[exercise.name], "vol");

  let todayOrm = exercise.assist ? -Infinity : 0, todayVol = 0;
  (exercise.sets || []).forEach(s => {
    if (!s.completed || s.kind !== 'work') return;
    const bs = (s.bands || []).reduce((a, b) => a + b, 0);
    const w = exercise.assist ? Math.max(0, (s.bodyweight || 0) - bs)
            : exercise.isBandsOnly ? bs
            : exercise.bandAddon ? (s.weight || 0) + bs
            : (s.weight || 0);
    const r = parseInt(s.reps) || 0;
    if (r > 0 && w > 0) {
      const isAssist = exercise.assist;
      let o;
      if (exercise.stages) {
        o = calcSet1RM(exercise.name, w, r, null, s.grip);
      } else if (isAssist) {
        const bw = s.bodyweight || 175;
        const totalOrm = r > 1 ? w * (1 + r / 30) : w;
        o = totalOrm - bw;
      } else {
        o = r > 1 ? w * (1 + r / 30) : w;
      }
      if (o > todayOrm) todayOrm = o;
      todayVol += w * r;
    }
  });
  const chartTodayDateStr = new Date(todayMs).toISOString().slice(0, 10);

  const ormHist = (todayOrm !== -Infinity)
    ? [...ormHistRaw.filter(d => d.date !== chartTodayDateStr), { date: chartTodayDateStr, orm: todayOrm }]
    : ormHistRaw;
  const volHist = (todayVol > 0)
    ? [...volHistRaw.filter(d => d.date !== chartTodayDateStr), { date: chartTodayDateStr, vol: todayVol }]
    : volHistRaw;
  const bestOrm = ormHist.length ? Math.max(...ormHist.map(d => d.orm !== undefined ? +d.orm : -Infinity)) : (exercise.assist ? -Infinity : 0);
  const bestWt = wtHist.length ? Math.max(...wtHist.map(d => d.wt !== undefined ? +d.wt : -Infinity)) : (exercise.assist ? -Infinity : 0);
  const bestReps = repsHist.length ? Math.max(...repsHist.map(d => +d.reps || 0)) : 0;
  const bestVol = volHist.length ? Math.max(...volHist.map(d => +d.vol || 0)) : 0;

  const hasPRs = exercise.assist
    ? (bestOrm !== -Infinity || bestWt !== -Infinity || bestVol > 0)
    : (bestOrm > 0 || bestWt > 0 || bestVol > 0);
  const primaryList = (muscleInfo.primary || []);
  const secondaryList = (muscleInfo.secondary || []);

  return (
    <div
      onMouseLeave={hideTip}
      style={{
        padding: 14, borderRadius: 14,
        background: T.cardBg, border: `1px solid ${T.cardBorder}`,
        color: T.text,
        position: "relative",
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: T.faint, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 1.0, marginBottom: 4 }}>STATS</div>
        <div style={{ color: T.strong, fontSize: 16, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.2 }}>{exercise.name}</div>
        {(primaryList.length > 0 || secondaryList.length > 0) && (
          <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {primaryList.map(m => (
              <span key={m} style={{
                color: T.bandsText, background: "rgba(192,132,252,0.12)",
                border: "1px solid rgba(192,132,252,0.25)",
                fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 0.4,
                padding: "2px 6px", borderRadius: 4, textTransform: "uppercase",
              }}>{m.replace("_", " ")}</span>
            ))}
            {secondaryList.map(m => (
              <span key={m} style={{
                color: T.muted, background: "rgba(255,255,255,0.03)",
                border: "1px dashed rgba(255,255,255,0.15)",
                fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 0.4,
                padding: "2px 6px", borderRadius: 4, textTransform: "uppercase",
              }}>{m.replace("_", " ")} ({Math.round(getMuscleImpact(exercise.name, m, false) * 100)}%)</span>
            ))}
          </div>
        )}
      </div>

      {(primaryList.length > 0 || secondaryList.length > 0) && (
        <Section label="HARD SETS · LAST 7 DAYS">
          {primaryList.map(m => (
            <VolumeBar key={m} exerciseName={exercise.name} muscle={m} events={muscleSets7d[m] || []} isPrimary={true} showTip={showTip} hideTip={hideTip} />
          ))}
          {secondaryList.map(m => (
            <VolumeBar key={m} exerciseName={exercise.name} muscle={m} events={muscleSets7d[m] || []} isPrimary={false} showTip={showTip} hideTip={hideTip} />
          ))}
        </Section>
      )}

      <Section label="PROGRESS · OVER LAST 30 DAYS">
        <Sparkline exerciseName={exercise.name} data={ormHist} valueKey="orm" color="#60A5FA"
          label={exercise.stages ? "STAGE" : "1RM EST"}
          fmt={exercise.stages
            ? (v => { const d = decodeStageScore(v); return `S${d.stage} · ${d.reps} reps`; })
            : (v => `${Math.round(v)} lb`)}
          showTip={showTip} hideTip={hideTip} />
        <Sparkline exerciseName={exercise.name} data={volHist} valueKey="vol" color="#34D399" label="VOLUME" fmt={v => `${Math.round(v).toLocaleString()} lb`} showTip={showTip} hideTip={hideTip} />
      </Section>

      {hasPRs && (
        <Section label="PRS">
          {(exercise.assist ? bestOrm !== -Infinity : bestOrm > 0) && (
            exercise.stages
              ? <KV k="Best stage" v={(() => { const d = decodeStageScore(bestOrm); const st = exercise.stages[d.stage - 1]; return `${st ? st.label : `S${d.stage}`} × ${d.reps}`; })()} />
              : <KV k="1RM est" v={`${Math.round(bestOrm)} lb`} />
          )}
          {!exercise.stages && (exercise.assist ? bestWt !== -Infinity : bestWt > 0) && <KV k="Top weight" v={`${bestWt} lb`} />}
          {bestReps > 0 && <KV k="Top reps" v={String(bestReps)} />}
          {bestVol > 0 && <KV k="Top volume" v={`${bestVol.toLocaleString()} lb`} />}
        </Section>
      )}

      {tip && (
        <div style={{
          position: "fixed", left: tip.x, top: tip.y, transform: "translate(-50%, -100%)",
          background: "#1f2937", border: "1px solid rgba(255,255,255,0.08)",
          padding: "5px 8px 4px", borderRadius: 6, pointerEvents: "none", zIndex: 100,
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          color: T.strong, fontFamily: T.mono, fontSize: 10, fontWeight: 600,
          whiteSpace: "nowrap",
        }}>
          {tip.content}
        </div>
      )}
    </div>
  );
}

// ─── file: workout-session-exercise-card.js ───

function ExerciseCard({ exercise, supersetTag, embedded, rest, onRestAdd, onRestSkip, onRestToggle, onPickWeight, onPickBodyweight, onPickGrip, onToggleBand, onClearBands, onLogReps, onSkipWarmup, onSkipExercise, onDeferExercise, onSwapExercise, onReopenSet, onAddSet, onRemoveSet, onRemoveWarmup }) {
  const [showAllFamilies, setShowAllFamilies] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const currentFamilyName = getSwapGroupName(exercise.name) || "Other";

  useEffect(() => {
    setShowAllFamilies(false);
  }, [exercise.name]);

  const swapGroup = getSwapGroup(exercise.name);
  const hasVariants = swapGroup && swapGroup.length > 1;
  const anyLogged = exercise.sets.some(s => s.completed && s.kind === "work");

  if (exercise.skipped) {
    return (
      <div style={{ margin: "0 16px 12px", padding: "10px 14px", background: "rgba(255,255,255,0.015)", border: `1px dashed ${T.cardBorder}`, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 1.0, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>× SKIPPED</span>
          {supersetTag && <span style={{ color: T.bands, fontFamily: T.mono, fontSize: 10, fontWeight: 800, letterSpacing: 1, padding: "1px 5px", borderRadius: 4, background: "rgba(192,132,252,0.10)", opacity: 0.6, flexShrink: 0 }}>{supersetTag}</span>}
          <span style={{ color: T.muted, fontSize: 15, fontWeight: 600, textDecoration: "line-through", textDecorationColor: "rgba(156,163,175,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exercise.name}</span>
        </div>
        <button onClick={onSkipExercise} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: T.muted, padding: "5px 10px", borderRadius: 7, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>↻ restore</button>
      </div>
    );
  }

  const activeIdx = exercise.sets.findIndex(s => s.active);
  const activeSet = activeIdx >= 0 ? exercise.sets[activeIdx] : null;
  const totalWork = exercise.sets.filter(s => s.kind === "work").length;
  const warmups = exercise.sets.filter(s => s.kind === "warmup");
  const totalWarmup = warmups.length;
  const hasWarmup = totalWarmup > 0;
  const warmupActive = warmups.some(s => s.active);
  const activeWarmupPos = activeSet && activeSet.kind === "warmup" ? warmups.indexOf(activeSet) + 1 : null;
  const lastWork = [...exercise.sets].reverse().find(s => s.kind === "work");
  const canRemove = totalWork > 1;



  const footerBtn = (label, onClick, disabled) => (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.06)", color: disabled ? T.disabled : T.muted, padding: "5px 10px", borderRadius: 7, cursor: disabled ? "default" : "pointer", fontSize: 12, fontWeight: 500, opacity: disabled ? 0.5 : 1 }}>{label}</button>
  );

  return (
    <div style={embedded ? {} : {
      margin: "0 16px 12px", padding: "14px 14px 14px",
      background: T.cardBg,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: 14,
    }}>
      {!embedded && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <h2 style={{ margin: 0, color: T.strong, fontSize: 20, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.4 }}>
            {supersetTag && (
              <span style={{
                color: T.bands, fontFamily: T.mono, fontSize: 11, fontWeight: 800, letterSpacing: 1,
                marginRight: 8, padding: "2px 6px", borderRadius: 5,
                background: "rgba(192,132,252,0.12)", verticalAlign: "middle",
              }}>{supersetTag}</span>
            )}
            {exercise.name}
            <span style={{ fontSize: 11, color: T.faint, fontWeight: 500, marginLeft: 8, fontFamily: T.mono, verticalAlign: "middle" }}>
              (~{Math.round(estimateExerciseDuration(exercise) / 60)} min)
            </span>
          </h2>
        </div>
      )}
      {!embedded && exercise.note && (
        <p style={{ margin: "6px 0 0", color: T.muted, fontSize: 12, lineHeight: 1.4 }}>{exercise.note}</p>
      )}



      {hasVariants && (!embedded || showVariants) && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 7,
            color: T.faint, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 1.0,
          }}>
            <span aria-hidden style={{ fontSize: 11 }}>⇄</span>
            CHOOSE VARIANT ({currentFamilyName})
            {anyLogged && (
              <span style={{ marginLeft: "auto", color: T.disabled, fontWeight: 600, letterSpacing: 0.4, textTransform: "none" }}>
                locked — sets logged
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {swapGroup.map(opt => {
              const selected = opt.name === exercise.name;
              const locked = anyLogged && !selected;
              return (
                <button
                  key={opt.name}
                  onClick={selected || locked ? undefined : () => onSwapExercise(opt.name)}
                  disabled={selected || locked}
                  style={{
                    flex: "1 1 auto", minWidth: 0,
                    padding: "10px 14px", borderRadius: 11,
                    fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, letterSpacing: -0.2,
                    textAlign: "center", lineHeight: 1.2,
                    cursor: selected ? "default" : locked ? "not-allowed" : "pointer",
                    transition: "all 160ms ease",
                    border: selected
                      ? "1px solid rgba(96,165,250,0.7)"
                      : `1px solid ${T.cardBorder}`,
                    background: selected
                      ? "linear-gradient(180deg, rgba(96,165,250,0.22), rgba(59,130,246,0.12))"
                      : locked ? "transparent" : "rgba(255,255,255,0.03)",
                    color: selected ? "#DBEAFE" : locked ? T.disabled : T.text,
                    boxShadow: selected ? "0 4px 16px -6px rgba(59,130,246,0.6)" : "none",
                    opacity: locked ? 0.45 : 1,
                  }}
                >
                  {selected && <span aria-hidden style={{ marginRight: 6, color: T.accentLight }}>●</span>}
                  {opt.name}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setShowAllFamilies(!showAllFamilies)}
              style={{
                background: "transparent",
                border: "none",
                color: T.accentLight,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 0",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span>{showAllFamilies ? "▾ Hide other families" : "▸ Swap with another family..."}</span>
            </button>

            {showAllFamilies && (
              <div style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 12,
                background: "rgba(255,255,255,0.015)",
                border: `1px solid ${T.cardBorder}`,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}>
                {SWAP_GROUPS.map(grp => {
                  if (grp.family === currentFamilyName) return null;
                  return (
                    <div key={grp.family} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, borderBottom: `1px dashed rgba(255,255,255,0.06)`, paddingBottom: 2 }}>
                        {grp.family}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {grp.exercises.map(opt => {
                          const locked = anyLogged;
                          return (
                            <button
                              key={opt.name}
                              onClick={locked ? undefined : () => onSwapExercise(opt.name)}
                              disabled={locked}
                              style={{
                                padding: "6px 10px", borderRadius: 8,
                                fontFamily: "inherit", fontSize: 11.5, fontWeight: 600,
                                cursor: locked ? "not-allowed" : "pointer",
                                border: `1px solid ${T.cardBorder}`,
                                background: "rgba(255,255,255,0.02)",
                                color: T.text,
                                opacity: locked ? 0.45 : 1,
                              }}
                            >
                              {opt.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="scroll-row" style={{
        display: "flex",
        overflowX: "auto",
        gap: 6, marginTop: 12,
        paddingBottom: 4,
        WebkitOverflowScrolling: "touch",
      }}>
        {exercise.sets.map((s, i) => (
          <SetCard key={i} s={s} idx={i} exercise={exercise} onReopenSet={onReopenSet} />
        ))}
      </div>

      {rest && <RestTimer rest={rest} onAdd={onRestAdd} onSkip={onRestSkip} onToggle={onRestToggle} />}

      {activeSet && (
        <ActiveSetBlock
          exercise={exercise}
          set={activeSet}
          totalWork={totalWork}
          totalWarmup={totalWarmup}
          warmupPos={activeWarmupPos}
          onPickWeight={(w) => onPickWeight(activeIdx, w)}
          onPickBodyweight={(w) => onPickBodyweight(activeIdx, w)}
          onPickGrip={(g) => onPickGrip(activeIdx, g)}
          onToggleBand={(b) => onToggleBand(activeIdx, b)}
          onClearBands={() => onClearBands(activeIdx)}
          onLogReps={(r) => onLogReps(activeIdx, r)}
          onSkipWarmup={onSkipWarmup}
          onApplyLast={() => {
            if (exercise.mode === "bodyweight") {
              onPickBodyweight(activeIdx, activeSet.lastBodyweight || 175);
              if (activeSet.lastGrip) onPickGrip(activeIdx, activeSet.lastGrip);
            } else if (!exercise.isBandsOnly) {
              onPickWeight(activeIdx, activeSet.lastWeight || 0);
            }
            onClearBands(activeIdx);
            (activeSet.lastBands || []).forEach(b => onToggleBand(activeIdx, b));
          }}
        />
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.cardBorder}`, flexWrap: "wrap" }}>
        {embedded && hasVariants && footerBtn(showVariants ? "▾ hide variants" : "⇄ variant", () => setShowVariants(!showVariants))}
        {footerBtn("+ set", onAddSet)}
        {footerBtn("− set", onRemoveSet, !canRemove)}
        {/* Defer: do this exercise later (moves it to the end). Standalone
            exercises only — superset members can't be reordered individually. */}
        {!exercise.superset && onDeferExercise && footerBtn("↓ do later", onDeferExercise)}
        {footerBtn("× skip exercise", onSkipExercise)}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {/* "Skip warmup" lives on the active warm-up set itself (ActiveSetBlock);
              the footer only offers removing the warm-up ramp once past it. */}
          {hasWarmup && !warmupActive && footerBtn("× warmup", onRemoveWarmup)}
        </div>
      </div>
    </div>
  );
}

// ─── file: workout-session-app.js ───

function App() { const [workoutId, setWorkoutId] = useState(() => { const fromUrl = new URLSearchParams(window.location.search).get("w");
    return (fromUrl && WORKOUTS.some(w => w.id === fromUrl)) ? fromUrl : (WORKOUTS.find(w => w.main) || WORKOUTS[0]).id; });
  const workout = useMemo(() => WORKOUTS.find(w => w.id === workoutId) || WORKOUTS[0], [workoutId]);
  const onPickWorkout = (id) => { if (id === workoutId) return;
    const url = new URL(window.location.href); url.searchParams.set("w", id);
    window.history.replaceState({}, "", url); setWorkoutId(id); };
  const [exercises, setExercises] = useState([]);
  const [sessionDate, setSessionDate] = useState(() => localDate());
  const [loaded, setLoaded] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [focusIdx, setFocusIdx] = useState(null);
  const { elapsed, running, startedAt, rest, setElapsed, setRunning, setStartedAt, setRest, startTimer, restAdd, restSkip, restToggle } = useWorkoutTimers(workoutId, exercises);
  const [motivations, setMotivations] = useState({});
  const [history, setHistory] = useState([]);
  const [statHistory, setStatHistory] = useState({});
  const [swaps, setSwaps] = useState({});
  const dataRef = useRef({ last: {}, hints: {} });
  useEffect(() => { let cancelled = false;
    setLoaded(false); setExercises([]); setSessionId(null); setMotivations({}); setHistory([]); setStatHistory([]); setSwaps({});
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
                const isBandOnly = official ? (official.equipment === "band" && !official.bandAddon && !isAssist) : (name.toLowerCase().includes("band") && !isAssist);
                
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
  }, [workout]);
  const startedAtRef = useRef(startedAt);
  startedAtRef.current = startedAt;
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  const saveDebounceRef = useRef(null);
  const queueSave = (currentExercises, currentSessionId, currentStartedAt, currentElapsed) => { clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      const latestStartedAt = startedAtRef.current;
      const latestElapsed = elapsedRef.current;
      const payload = serializeForSave(currentExercises, workout.name, currentSessionId, latestStartedAt, latestElapsed, sessionDate);
      if (payload.sets.length === 0 && !latestStartedAt && !currentSessionId) return;
      autoSavePayload(payload, (newId) => { if (!currentSessionId && newId) setSessionId(newId); });
    }, 400); };
  const actions = useWorkoutActions({ workout, exercises, setExercises, sessionDate, sessionId, setSessionId, startedAt, elapsed, swaps, setSwaps, dataRef, startTimer, setRest, queueSave });
  const currentIdx = (() => { let i = exercises.findIndex(e => !e.skipped && e.sets.some(s => s.active));
    if (i !== -1) return i;
    i = exercises.findIndex(e => !e.skipped && e.sets.some(s => !s.completed));
    if (i !== -1) return i;
    return exercises.length - 1; })();
  useEffect(() => { setFocusIdx(null); }, [currentIdx]);
  const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = exercises.reduce((n, e) => e.skipped ? n + e.sets.length : n + e.sets.filter(s => s.completed).length, 0);
  const isFinished = totalSets > 0 && doneSets === totalSets;
  useEffect(() => { if (isFinished) { setRunning(false);
      setRest(null); } }, [isFinished]);
  const onSelectExercise = (idx) => { setFocusIdx(idx);
    const ex = exercises[idx]; if (!ex || ex.skipped) return;
    const hasActiveHere = ex.sets.some(s => s.active);
    const firstIncomplete = ex.sets.findIndex(s => !s.completed);
    if (!hasActiveHere && firstIncomplete !== -1) { const next = exercises.map((e) => ({ ...e, sets: e.sets.map(s => s.active ? { ...s, active: false } : s), }));
      next[idx] = { ...next[idx], sets: next[idx].sets.map((s, j) => j === firstIncomplete ? { ...s, active: true } : s), };
      actions.onPickWeight(idx, firstIncomplete, next[idx].sets[firstIncomplete].weight, next); } };
  const onSelectSet = (exIdx, setIdx) => { setFocusIdx(exIdx);
    const ex = exercises[exIdx]; if (!ex || ex.skipped) return;
    const next = exercises.map((e, idx) => idx !== exIdx ? { ...e, sets: e.sets.map(s => s.active ? { ...s, active: false } : s) } : { ...e, sets: e.sets.map((s, j) => ({ ...s, active: j === setIdx })), });
    const selectedSet = next[exIdx].sets[setIdx];
    actions.onPickWeight(exIdx, setIdx, selectedSet.weight || selectedSet.lastWeight || 0, next); };
  if (!loaded) { return ( <div style={{ height: "100%", overflowY: "auto" }}>
        <div style={{ maxWidth: 448, margin: "0 auto", minHeight: "100%", background: T.page }}>
          <Header workout={workout} workouts={WORKOUTS} onPickWorkout={onPickWorkout} done={0} total={0} elapsedSec={0} running={false} onToggleTimer={() => {}} deload={!!window.SESSION_DELOAD} />
          <div style={{ margin: "40px 16px", padding: "20px", textAlign: "center", color: T.muted, fontFamily: T.mono, fontSize: 13, border: `1px dashed ${T.cardBorder}`, borderRadius: 12 }}>
            loading workout…
          </div>
        </div>
      </div> ); }
  const shownIdx = (focusIdx != null && exercises[focusIdx]) ? focusIdx : (isFinished ? null : currentIdx);
  const shownExercise = shownIdx !== null ? exercises[shownIdx] : null;
  const nav = (variant) => ( <ExerciseNav
      exercises={exercises}
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
      <div className="session-shell">
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
            running={running}
            onToggleTimer={() => setRunning(r => !r)}
            deload={!!window.SESSION_DELOAD} />
          <div className="exercise-nav-strip">
            {nav("strip")}
          </div>
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
            const card = ( <ExerciseCard exercise={ex}
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
                            <h2 style={{ margin: 0, color: T.strong, fontSize: 18, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.3 }}>{m.e.name}</h2>
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
