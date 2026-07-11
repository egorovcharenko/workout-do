"use client";
import { T, stageRank } from "@/lib/legacy/shared";
import { cableStackMultiplier } from "@/lib/legacy/cable-stack";

// ─── file: workout-session-nav-chip.js ───

function navSetDisplay(s, exercise) {
  const weightMultiplier = cableStackMultiplier(exercise.name);
  if (exercise.repsOnly) {
    if (s.completed) return { repsOnly: true, reps: s.reps, state: "done", kind: s.kind };
    if (s.active) return { repsOnly: true, reps: s.reps != null ? s.reps : s.lastReps, state: "current", kind: s.kind };
    return { repsOnly: true, reps: s.lastReps != null ? s.lastReps : null, state: "upcoming", preview: true, kind: s.kind };
  }
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
  if (s.completed) return { lb: cur, reps: s.reps, state: "done", kind: s.kind, weightMultiplier };
  if (s.active) {
    const reps = s.reps != null ? s.reps : (s.lastReps != null ? s.lastReps : null);
    return { lb: cur || prevW, reps, state: "current", kind: s.kind, weightMultiplier };
  }
  return { lb: prevW || cur, reps: s.lastReps != null ? s.lastReps : null, state: "upcoming", preview: true, kind: s.kind, weightMultiplier };
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
      {d.repsOnly
        ? (d.reps != null ? d.reps : "—")
        : <>{d.lb || "—"}{d.weightMultiplier === 2 && <span style={{ color: box.xColor, fontWeight: 600, fontSize: 10 }}>×2</span>}<span style={{ color: box.xColor, fontWeight: 400, fontSize: 11 }}>×</span>{d.reps != null ? d.reps : "—"}</>}
    </span>
  );
}

export { navSetDisplay, SetChip };
