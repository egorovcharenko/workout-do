"use client";
import React from "react";
import { T, stageRank } from "@/lib/legacy/shared";
import { fmtSetDuration } from "@/lib/legacy/session-utils";

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

function SetCard({ s, idx, exercise, onReopenSet, dur }) {
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
  const wDelta = exercise.repsOnly ? 0 : stages ? (lastRank > 0 ? curRank - lastRank : 0) : totalLb - prev;
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
        if (exercise.repsOnly) {
          return (
            <div style={{ display: "flex", alignItems: "baseline", gap: 3, fontFamily: T.mono }}>
              <span style={{ color: repColor, fontSize: 16, fontWeight: 700, letterSpacing: -0.3, fontStyle: isPreview ? "italic" : "normal" }}>{repText}</span>
              <span style={{ color: T.disabled, fontSize: 10 }}>reps</span>
            </div>
          );
        }
        return (
          <div style={{ display: "flex", alignItems: "baseline", gap: 2, fontFamily: T.mono }}>
            <span style={{ color: (s.completed || isCurrent) ? T.strong : T.faint, fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>{stages ? (curRank > 0 ? `S${curRank}` : "—") : totalLb}</span>
            <span style={{ color: T.disabled, fontSize: 11 }}>×</span>
            <span style={{ color: repColor, fontSize: 16, fontWeight: 700, letterSpacing: -0.3, fontStyle: isPreview ? "italic" : "normal" }}>{repText}</span>
          </div>
        );
      })()}
      {s.completed ? (
        <span style={{ color: deltaColor, fontFamily: T.mono, fontSize: 10, fontWeight: 700 }}>
          {deltaText}
          {dur != null && <span style={{ color: T.disabled, fontWeight: 500, fontSize: 9 }}> · {fmtSetDuration(dur)}</span>}
        </span>
      ) : isCurrent ? (
        <span style={{ color: isWarm ? T.amber : T.accentLight, fontFamily: T.mono, fontSize: 10, fontWeight: 700 }}>● now</span>
      ) : (
        <span style={{ color: T.disabled, fontFamily: T.mono, fontSize: 10 }}>up next</span>
      )}
    </button>
  );
}

export { setStripLabel, SetCard };
