"use client";
import { T, GRIP_LABELS, parseRepTargetRange, stageLabel } from "@/lib/legacy/shared";
import { GripSelector, BandsGrid } from "./Stepper";
import { StageSelector } from "./StageSelector";
import { RepStrip } from "./RepStrip";
import { BarbellVisualizer } from "./BarbellVisualizer";
import { CableStackVisualizer } from "./CableStackVisualizer";
import { EquipmentWeightSelector } from "./WeightSelection";
import { BeltPlateVisualizer } from "./BeltPlateVisualizer";
import { cableStackMultiplier, isCableStackExercise } from "@/lib/legacy/cable-stack";

// ─── file: workout-session-activeset.js ───

// BarbellVisualizer component has been extracted to its own file: /workout-session-barbell-visualizer.js

function ActiveSetBlock({ exercise, set, totalWork, totalWarmup, warmupPos, onPickWeight, onPickBodyweight, onPickGrip, onToggleBand, onClearBands, onLogReps, onSkipWarmup, onApplyLast }) {
  const isBW = exercise.mode === "bodyweight";
  const isCable = isCableStackExercise(exercise.name, exercise.equipment);
  const cableMultiplier = cableStackMultiplier(exercise.name);
  const bands = set.bands || [];
  const lastBands = set.lastBands || [];
  const baseW = isBW ? (set.bodyweight || 0) : set.weight;
  const lastBaseW = isBW ? (set.lastBodyweight || 0) : (set.lastWeight || 0);
  const bandTotal = bands.reduce((a, b) => a + b, 0);
  const lastBandTotal = lastBands.reduce((a, b) => a + b, 0);
  const lastTotal = isBW ? Math.max(0, lastBaseW - lastBandTotal) : (lastBaseW + lastBandTotal);

  const stages = exercise.stages || null;
  const matchesLast = exercise.repsOnly
    ? (set.lastReps != null && (!exercise.grips || set.grip === set.lastGrip) && (!exercise.beltLoad || (set.weight || 0) === (set.lastWeight || 0)))
    : stages
    ? (set.lastReps != null && set.grip === set.lastGrip)
    : (set.lastReps != null) &&
      baseW === lastBaseW &&
      (!exercise.grips || set.grip === set.lastGrip) &&
      bands.length === lastBands.length &&
      bands.every(b => lastBands.includes(b));
  const hideMatchedStatus = exercise.name === "Pull-Ups" && matchesLast;

  const hasLast = set.lastWeight != null || set.lastBodyweight != null || set.lastReps != null;
  const range = set.targetRepRange || parseRepTargetRange(exercise.repRange);
  const weightVisualKind = isBW
    ? "bodyweight"
    : /dumbbell|\bdb\b|goblet|lunge|bulgarian/i.test(exercise.name)
      ? "dumbbell"
      : "weight";

  return (
    <div style={{
      borderRadius: 12,
      background: "linear-gradient(180deg, rgba(59,130,246,0.08), rgba(17,24,39,0.55))",
      boxShadow: "0 0 0 1px rgba(96,165,250,0.35), 0 8px 24px -8px rgba(59,130,246,0.4)",
      padding: "12px 12px 14px",
      marginTop: 12, marginBottom: 6,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, gap: 10 }}>
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
            color: T.accentLight, marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, fontFamily: T.mono, opacity: 0.75 }}>LAST</span>
            <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: "#DBEAFE" }}>
              {exercise.repsOnly && !exercise.beltLoad ? (
                <>
                  {set.lastReps || "—"}<span style={{ color: T.faint, fontWeight: 500 }}> reps</span>
                  {exercise.grips && set.lastGrip && <span style={{ color: T.muted, fontWeight: 500 }}> · {GRIP_LABELS[set.lastGrip]?.label || set.lastGrip}</span>}
                </>
              ) : (
                <>
                  {exercise.beltLoad ? (set.lastWeight > 0 ? `+${set.lastWeight} lb` : "Bodyweight") : stages ? (stageLabel(stages, set.lastGrip) || "—") : `${lastBaseW || "—"}${cableMultiplier === 2 ? "×2" : ""}`}
                  {!stages && lastBands.length > 0 && (
                    <span style={{ color: T.bands }}> {isBW ? "−" : "+"} {lastBands.join("+")}</span>
                  )}
                  <span style={{ color: T.faint, fontWeight: 500 }}> × </span>
                  {set.lastReps || "—"}
                  {!stages && isBW && set.lastGrip && <span style={{ color: T.muted, fontWeight: 500 }}> · {GRIP_LABELS[set.lastGrip]?.label || set.lastGrip}</span>}
                </>
              )}
            </span>
            {lastBandTotal > 0 && (
              <span style={{ color: T.faint, fontFamily: T.mono, fontSize: 11 }}>({lastTotal}lb)</span>
            )}
          </div>
          {!hideMatchedStatus && (
            <span style={{ fontSize: 12, fontWeight: 600, opacity: matchesLast ? 0.7 : 1 }}>
              {matchesLast ? "✓ matched" : "use last"}
            </span>
          )}
        </button>
      )}

      {exercise.grips && (
        <GripSelector
          grips={exercise.grips}
          selected={set.grip}
          last={set.lastGrip}
          attempts={exercise.stageAttempts || exercise.sets.filter((candidate) => candidate.kind === "work").map((candidate) => ({ stageId: candidate.lastGrip, reps: candidate.lastReps }))}
          requiredSets={totalWork}
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

      {!exercise.isBandsOnly && !stages && !exercise.repsOnly && !isCable && !exercise.isBarbell && (
        <EquipmentWeightSelector
          value={baseW}
          last={lastBaseW || null}
          onPick={isBW ? onPickBodyweight : onPickWeight}
          kind={weightVisualKind}
          compact
        />
      )}

      {exercise.beltLoad && (
        <BeltPlateVisualizer
          weight={set.weight || 0}
          last={set.lastWeight ?? null}
          onWeightChange={onPickWeight}
          compact
        />
      )}

      {!exercise.isBandsOnly && !stages && !exercise.repsOnly && isCable && (
        <CableStackVisualizer
          exerciseName={exercise.name}
          value={baseW || 0}
          last={lastBaseW || null}
          onPick={onPickWeight}
        />
      )}

      {!isBW && exercise.isBarbell && (
        <BarbellVisualizer
          weight={baseW || 45}
          onWeightChange={onPickWeight}
          compact
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

      <div style={{ marginTop: 10 }}>
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

export { ActiveSetBlock };
