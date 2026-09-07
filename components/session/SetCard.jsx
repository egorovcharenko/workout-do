"use client";
import React from "react";
import { T, stageRank } from "@/lib/legacy/shared";
import { fmtSetDuration } from "@/lib/legacy/session-utils";
import { cableStackMultiplier } from "@/lib/legacy/cable-stack";

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
  // The Pull-Ups opener: one strict set with no band assistance, logged before
  // the working sets to track raw unassisted strength.
  if (s.idx === "UA") return "UA";
  return `S${s.idx}`;
}

function SetCard({ s, idx, exercise, onReopenSet, dur }) {
  const guidance = s.repGuidance;
  const previous = guidance?.previous;
  const lastReps = guidance ? previous?.reps : s.lastReps;
  const isBW = exercise.mode === "bodyweight";
  const isAssist = exercise.assist;
  const isBandsOnly = exercise.isBandsOnly;
  const baseW = isBW ? (s.bodyweight || 0) : (s.weight || 0);
  const lastBaseW = isBW ? (s.lastBodyweight || 0) : (s.lastWeight || 0);
  const bandSum = (s.bands || []).reduce((a, b) => a + b, 0);
  const lastBandSum = (s.lastBands || []).reduce((a, b) => a + b, 0);
  const totalLb = isAssist ? Math.max(0, baseW - bandSum) : (isBandsOnly ? bandSum : baseW + bandSum);
  const weightDisplay = cableStackMultiplier(exercise.name) === 2 ? `${totalLb}×2` : totalLb;
  const prev = isAssist ? Math.max(0, lastBaseW - lastBandSum) : (isBandsOnly ? lastBandSum : lastBaseW + lastBandSum);
  const stages = exercise.stages || null;
  // Staged exercise: the "weight" slot shows the stage (S1..Sn); deltas compare
  // stage rank first, then reps.
  const curRank = stages ? stageRank(stages, s.grip || s.lastGrip) : 0;
  const lastRank = stages ? stageRank(stages, s.lastGrip) : 0;
  const wDelta = guidance ? previous?.loadDelta || 0
    : exercise.repsOnly && !exercise.beltLoad ? 0 : stages ? (lastRank > 0 ? curRank - lastRank : 0) : totalLb - prev;
  const rDelta = lastReps != null && s.reps != null ? s.reps - lastReps : 0;
  const isFlat = wDelta === 0 && rDelta === 0;
  const isDown = wDelta < 0 || (wDelta === 0 && rDelta < 0);
  const deltaColor = isFlat ? T.faint : isDown ? T.red : T.green;
  const deltaText = !s.completed || (guidance && (!previous || (!previous.sameVariation && !stages))) ? "" : isFlat ? "=" :
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
      padding: "7px 9px", borderRadius: 9,
      cursor: tappable ? "pointer" : "default",
      background: isCurrent
        ? (isWarm ? "rgba(217,119,6,0.12)" : "rgba(59,130,246,0.14)")
        : s.completed ? "rgba(255,255,255,0.03)" : "transparent",
      boxShadow: isCurrent
        ? (isWarm ? "inset 0 0 0 2px rgba(251,191,36,0.55), 0 4px 14px -4px rgba(217,119,6,0.45)"
                  : "inset 0 0 0 2px rgba(96,165,250,0.6), 0 4px 14px -4px rgba(59,130,246,0.5)")
        : "none",
      border: isCurrent ? "0" : `1px ${s.completed ? "solid" : "dashed"} rgba(255,255,255,0.05)`,
      opacity: 1,
      display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "center", gap: 5,
      flex: "1 0 auto", flexShrink: 0, transition: "all 200ms ease",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
      <span style={{ color: isWarm ? T.amber : isCurrent ? T.accentLight : T.faint, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 0.7 }}>
        {setStripLabel(s, exercise.sets)}
        {!s.completed && (guidance?.rangeLabel || guidance?.rirLabel) && <span style={{ color: T.muted, marginLeft: 4, fontSize: 8 }}>TARGET</span>}
      </span>
      {(() => {
        const targetRange = s.targetRepRange;
        const targetReps = guidance ? guidance.rangeLabel : targetRange
          ? (targetRange[0] === targetRange[1] ? String(targetRange[0]) : targetRange.join("–"))
          : null;
        const isPreview = s.reps == null && (targetReps != null || lastReps != null);
        const repText = s.reps ?? targetReps ?? guidance?.suggested ?? lastReps ?? "—";
        const repColor = isPreview ? T.muted : (s.completed || isCurrent) ? T.strong : T.text;
        const loadText = exercise.beltLoad ? (totalLb > 0 ? `+${totalLb}` : "BW") : stages ? (curRank > 0 ? `S${curRank}` : "—") : weightDisplay;
        if (!s.completed && s.reps == null && guidance?.rirLabel && !guidance.rangeLabel) {
          return <div style={{ display: "flex", alignItems: "baseline", gap: 5, fontFamily: T.mono, fontSize: 14, fontWeight: 700 }}>
            {(!exercise.repsOnly || exercise.beltLoad) && <span style={{ color: T.text }}>{loadText} ·</span>}
            <span style={{ color: T.accentLight }}>{guidance.rirLabel} RIR</span>
          </div>;
        }
        if (exercise.repsOnly && !exercise.beltLoad) {
          return (
            <div style={{ display: "flex", alignItems: "baseline", gap: 3, fontFamily: T.mono }}>
              <span style={{ color: repColor, fontSize: 16, fontWeight: 700, letterSpacing: -0.3, fontStyle: "normal" }}>{repText}</span>
              <span style={{ color: T.disabled, fontSize: 10 }}>reps</span>
            </div>
          );
        }
        return (
          <div style={{ display: "flex", alignItems: "baseline", gap: 2, fontFamily: T.mono }}>
            <span style={{ color: (s.completed || isCurrent) ? T.strong : T.text, fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>{loadText}</span>
            <span style={{ color: T.disabled, fontSize: 11 }}>×</span>
            <span style={{ color: repColor, fontSize: 16, fontWeight: 700, letterSpacing: -0.3, fontStyle: "normal" }}>{repText}</span>
          </div>
        );
      })()}
      {isCurrent && <span style={{ color: isWarm ? T.amber : T.accentLight, fontSize: 9 }}>●</span>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, fontFamily: T.mono, fontSize: 10 }}>
        <span title={previous ? `${previous.date} · ${previous.workout}` : undefined} style={{ color: T.muted }}>Last <strong style={{ color: T.text, fontWeight: 700 }}>{previous && !previous.comparable ? previous.label : lastReps ?? "—"}</strong>{lastReps != null && (!previous || previous.comparable) ? " reps" : ""}</span>
        {!s.completed && guidance?.rirLabel && guidance.rangeLabel && <span style={{ color: T.accentLight }}>{guidance.rirLabel} RIR</span>}
        {!s.completed && guidance?.suggested != null && <span style={{ color: T.accentLight }}>Suggested <strong>{guidance.suggested}</strong></span>}
        {s.completed && s.rir != null && <span style={{ color: T.accentLight, whiteSpace: "nowrap" }}>{s.rir.replace("-", "–")} RIR</span>}
        {s.completed && <span style={{ color: deltaColor, fontWeight: 700 }}>
          {deltaText}
          {dur != null && <span style={{ color: T.muted, fontWeight: 500, fontSize: 9 }}> · {fmtSetDuration(dur)}</span>}
        </span>}
      </div>
    </button>
  );
}

export { setStripLabel, SetCard };
