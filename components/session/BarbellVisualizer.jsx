"use client";
import { T } from "@/lib/legacy/shared";
import { removeBarbellPlate } from "@/lib/legacy/plate-load";
import { WeightStepper } from "./Stepper";
import { WeightSelectionFrame } from "./WeightSelection";

// ─── file: workout-session-barbell-visualizer.js ───

function BarbellVisualizer({ weight, onWeightChange, compact = false }) {
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
  const pickerScale = compact ? 0.68 : 1;
  const scaledPicker = (value) => Math.round(value * pickerScale);

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
  const handleRemovePlateAtIndex = (idx) => onWeightChange(removeBarbellPlate(weight, loadedPlates[idx]));
  const handleClear = () => onWeightChange(45);

  const getPlateWidth = (p) => {
    const width = ({ 45: 18, 35: 14, 25: 11, 15: 9, 10: 8, 5: 8, 2.5: 7, 1: 6, 0.5: 5 }[p] || 12);
    return compact ? Math.round(width * 1.3) : width;
  };
  const getPlateHeight = (p) => ({ 45: 72, 35: 72, 25: 72, 15: 72, 10: 72, 5: 33, 2.5: 27, 1: 22, 0.5: 18 }[p] || 36);

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
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(28px, 1fr))",
        gap: compact ? 3 : 4,
      }}>
        {PLATE_SIZES.map(p => {
          const label = p === 0.5 ? '.5' : p;
          return (
            <button
              key={p}
              onClick={() => handleAddPlate(p)}
              aria-label={`Add ${p} pound plate per side`}
              style={{
                minWidth: 0,
                height: compact ? 42 : 72,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.04)",
                borderRadius: compact ? 7 : 8,
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
                  height: scaledPicker(B_HEIGHTS[p]),
                  background: PLATE_COLORS[p].bg,
                  color: PLATE_COLORS[p].text,
                  fontSize: compact ? (p >= 25 ? 11 : p >= 10 ? 10 : 9) : (p >= 25 ? 14 : p >= 10 ? 12.5 : 11),
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
  );

  const renderLoadedSleeve = () => {
    return (
      <div style={{
        position: "absolute",
        left: "50%",
        top: "6%",
        height: "88%",
        marginLeft: 3,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
      }}>
        {loadedPlates.map((p, idx) => {
          const isDarkText = PLATE_COLORS[p].text === "#1E293B";
          const textShadow = isDarkText
            ? "0 0 2px #fff, 0 0 2px #fff, 0 0 2px #fff"
            : "0 0 2px #000, 0 0 2px #000, 0 0 2px #000";
          return (
            <button
              type="button"
              key={`plate-${idx}`}
              onClick={() => handleRemovePlateAtIndex(idx)}
              title={`Remove ${p} pound plate per side`}
              aria-label={`Remove ${p} pound plate per side`}
              style={{
                position: "relative",
                width: getPlateWidth(p),
                height: `${Math.round((getPlateHeight(p) / 72) * 100)}%`,
                border: 0,
                padding: 0,
                background: PLATE_COLORS[p].bg,
                color: PLATE_COLORS[p].text,
                fontSize: compact ? (p >= 25 ? 13.5 : p >= 10 ? 12 : 10.5) : (p >= 25 ? 12.5 : p >= 10 ? 11 : 9.5),
                fontWeight: 900,
                fontFamily: T.mono,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 2,
                cursor: "pointer",
                touchAction: "manipulation",
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
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <WeightSelectionFrame
      compact={compact}
      visualExpanded
      visual={(
        <>
          {/* One half of the shaft, ending at the loaded sleeve. */}
          <div style={{
            position: "absolute",
            left: "2%",
            top: "50%",
            transform: "translateY(-50%)",
            width: "48%",
            height: compact ? 6 : 4,
            background: "linear-gradient(180deg, #94A3B8, #475569)",
            borderRadius: 1,
          }} />

          {/* Single sleeve. */}
          <div style={{
            position: "absolute",
            left: "50%",
            right: "2%",
            top: "50%",
            transform: "translateY(-50%)",
            height: compact ? 12 : 8,
            background: "linear-gradient(180deg, #CBD5E1, #94A3B8)",
            borderRadius: "0 2px 2px 0",
          }} />

          {/* Collar / sleeve stop. */}
          <div style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translateY(-50%)",
            width: 4,
            height: compact ? 28 : 18,
            background: "#475569",
            borderRadius: 1,
          }} />

          {/* Loaded plates, inside out from the collar. */}
          {renderLoadedSleeve()}
        </>
      )}
      controls={(
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 10, minWidth: 0 }}>
          <WeightStepper
            value={weight}
            onPick={onWeightChange}
            compact={compact}
            showLastHint={false}
            embedded
          />
          {plateLoader}
        </div>
      )}
    />
  );
}

export { BarbellVisualizer };
