"use client";
import { parseRepTargetRange } from "@/lib/legacy/shared";
import { GripSelector, BandsGrid } from "./Stepper";
import { StageSelector } from "./StageSelector";
import { RepStrip } from "./RepStrip";
import { BarbellVisualizer } from "./BarbellVisualizer";
import { CableStackVisualizer } from "./CableStackVisualizer";
import { EquipmentWeightSelector } from "./WeightSelection";
import { BeltPlateVisualizer } from "./BeltPlateVisualizer";
import { isCableStackExercise } from "@/lib/legacy/cable-stack";

// ─── file: workout-session-activeset.js ───

// BarbellVisualizer component has been extracted to its own file: /workout-session-barbell-visualizer.js

function ActiveSetBlock({ exercise, set, totalWork, onPickWeight, onPickBodyweight, onPickGrip, onToggleBand, onClearBands, onLogReps, onSkipWarmup }) {
  const isBW = exercise.mode === "bodyweight";
  const isCable = isCableStackExercise(exercise.name, exercise.equipment);
  const bands = set.bands || [];
  const lastBands = set.lastBands || [];
  const baseW = isBW ? (set.bodyweight || 0) : set.weight;
  const lastBaseW = isBW ? (set.lastBodyweight || 0) : (set.lastWeight || 0);

  const stages = exercise.stages || null;
  const range = set.targetRepRange || parseRepTargetRange(exercise.repRange);
  const weightVisualKind = isBW
    ? "bodyweight"
    : /dumbbell|\bdb\b|goblet|lunge|bulgarian/i.test(exercise.name)
      ? "dumbbell"
      : "weight";

  return (
    <div className="active-set-block" style={{
      borderRadius: 12,
      background: "linear-gradient(180deg, rgba(59,130,246,0.08), rgba(17,24,39,0.55))",
      boxShadow: "0 0 0 1px rgba(96,165,250,0.35), 0 8px 24px -8px rgba(59,130,246,0.4)",
      padding: "12px 12px 14px",
      marginTop: 12, marginBottom: 6,
    }}>
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
          compact
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

      <div className="rep-entry-dock">
        <RepStrip
          min={1} max={20}
          range={range}
          last={set.lastReps}
          logged={set.reps}
          onLog={onLogReps}
        />
      </div>

      {set.kind === "warmup" && (
        <div className="asb-skip" style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
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
