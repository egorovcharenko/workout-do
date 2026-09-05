"use client";
import { T } from "@/lib/legacy/shared";
import { BARBELL_PLATES } from "@/lib/legacy/plate-load";
import { currentBarStack, setBarStack } from "@/lib/legacy/bar-stack";
import { WeightStepper } from "./Stepper";
import { WeightSelectionFrame } from "./WeightSelection";

// ─── file: workout-session-barbell-visualizer.js ───

function BarbellVisualizer({ exercise = null, weight, onWeightChange, compact = false }) {
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

  const PLATE_SIZES = BARBELL_PLATES;
  // Plates on one side, collar outward, carried over from the previous set.
  const loadedPlates = currentBarStack(exercise, weight);

  const setStack = (plates) => onWeightChange(setBarStack(exercise, plates));
  const handleAddPlate = (p) => setStack([...loadedPlates, p]);
  const handleRemovePlateAtIndex = (idx) => setStack(loadedPlates.filter((_, i) => i !== idx));
  const handleClear = () => setStack([]);

  const plateLoader = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.6 }}>
          ADD PLATES (PER SIDE)
        </span>
        {loadedPlates.length > 0 && (
          <button
            onClick={handleClear}
            title="Reset to bar (45lb)"
            style={{
              background: "transparent",
              border: 0,
              color: T.red,
              fontFamily: T.mono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 0.4,
              cursor: "pointer",
              padding: "2px 0",
            }}
          >
            {compact ? "RESET 45LB" : "RESET TO BAR (45LB)"}
          </button>
        )}
      </div>
      <div className="barbell-plate-picker">
        {PLATE_SIZES.map(p => (
          <button
            type="button"
            key={p}
            onClick={() => handleAddPlate(p)}
            aria-label={`Add ${p} pound plate per side`}
            className="barbell-plate-option"
            style={{ "--plate-color": PLATE_COLORS[p].bg }}
          >
            <span aria-hidden="true" className="barbell-plate-swatch" />
            <span>{p}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const loadedPlateControls = (
    <div className="loaded-plate-controls" role="group" aria-label="Loaded plates per side, inside to outside">
      {loadedPlates.map((p, idx) => (
        <button
          type="button"
          key={`plate-${idx}`}
          onClick={() => handleRemovePlateAtIndex(idx)}
          title={`Remove ${p} pound plate per side`}
          aria-label={`Remove ${p} pound plate per side`}
          style={{ background: PLATE_COLORS[p].bg, color: PLATE_COLORS[p].text }}
        >{p}</button>
      ))}
    </div>
  );

  return (
    <WeightSelectionFrame
      compact={compact}
      stacked
      controls={(
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 10, minWidth: 0 }}>
          <WeightStepper
            label={(
              <div className="barbell-weight-heading">
                <span>TOTAL WEIGHT · LB</span>
                {loadedPlateControls}
              </div>
            )}
            quantum={1}
            fineStep={1}
            minimum={45}
            value={weight}
            onPick={onWeightChange}
            compact={compact}
            showLastHint={false}
            embedded
          />

        </div>
      )}
    >
      {plateLoader}
    </WeightSelectionFrame>
  );
}

export { BarbellVisualizer };
