"use client";

import { T } from "@/lib/legacy/shared";
import { BELT_PLATES, decomposeBeltLoad, removeBeltPlate } from "@/lib/legacy/plate-load";
import { WeightStepper } from "./Stepper";
import { WeightSelectionFrame } from "./WeightSelection";

const PLATE_STYLE = {
  45: { bg: "#3B82F6", text: "#FFFFFF", size: 54 },
  35: { bg: "#EAB308", text: "#1E293B", size: 50 },
  25: { bg: "#10B981", text: "#FFFFFF", size: 46 },
  15: { bg: "#F97316", text: "#FFFFFF", size: 42 },
  10: { bg: "#F8FAFC", text: "#1E293B", size: 38 },
  5: { bg: "#6B7280", text: "#FFFFFF", size: 34 },
  2.5: { bg: "#EF4444", text: "#FFFFFF", size: 30 },
  1.25: { bg: "#06B6D4", text: "#FFFFFF", size: 28 },
  0.5: { bg: "#A855F7", text: "#FFFFFF", size: 27 },
};

const decomposeLoad = decomposeBeltLoad;

function Plate({ value, compact = false, onClick, title }) {
  const style = PLATE_STYLE[value];
  const size = compact ? Math.round(style.size * 0.72) : style.size;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: "50%",
        border: "2px solid rgba(255,255,255,0.24)",
        background: style.bg,
        color: style.text,
        boxShadow: "0 4px 10px rgba(0,0,0,0.35), inset 0 0 0 5px rgba(15,23,42,0.12)",
        fontFamily: T.mono,
        fontSize: compact ? 9 : 11,
        fontWeight: 900,
        cursor: "pointer",
        touchAction: "manipulation",
        padding: 0,
      }}
    >
      {value}
    </button>
  );
}

function BeltPlateVisualizer({ weight, last, onWeightChange, compact = false }) {
  const loaded = decomposeLoad(weight);

  return (
    <WeightSelectionFrame
      compact={compact}
      visualExpanded
      visual={(
        <div style={{ width: "100%", height: "100%", minHeight: 108, position: "relative", display: "flex", justifyContent: "center" }}>
          <div style={{ position: "absolute", top: 4, width: "72%", height: 36, border: "8px solid #64748B", borderBottom: 0, borderRadius: "50% 50% 0 0" }} />
          <div style={{ position: "absolute", top: 33, width: 2, height: 34, background: "repeating-linear-gradient(#CBD5E1 0 3px, #475569 3px 6px)" }} />
          {loaded.length === 0 ? (
            <div style={{ position: "absolute", top: 72, color: T.faint, fontFamily: T.mono, fontSize: 9, fontWeight: 800 }}>BODYWEIGHT</div>
          ) : (
            <div style={{ position: "absolute", top: 58, left: "3%", right: "3%", display: "flex", alignItems: "center", justifyContent: loaded.length < 4 ? "center" : "flex-start", overflowX: "auto", padding: "2px 2px 18px", WebkitOverflowScrolling: "touch" }}>
              {loaded.map((plate, index) => (
                <div key={`${plate}-${index}`} style={{ position: "relative", flex: "0 0 auto", marginLeft: index ? -10 : 0, zIndex: loaded.length - index }}>
                  <Plate value={plate} compact onClick={() => onWeightChange(removeBeltPlate(weight, plate))} title={`Remove ${plate} pound plate from belt`} />
                </div>
              ))}
              <span style={{ position: "absolute", left: 0, right: 0, bottom: 1, color: T.faint, fontFamily: T.mono, fontSize: 7, fontWeight: 800, letterSpacing: 0.5, textAlign: "center", pointerEvents: "none" }}>TAP PLATE TO REMOVE</span>
            </div>
          )}
        </div>
      )}
      controls={(
        <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
          <WeightStepper value={weight || 0} last={last} onPick={onWeightChange} compact={compact} showLastHint={false} embedded />
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 0.6 }}>BELT PLATES · TAP TO ADD</span>
              {weight > 0 && (
                <button type="button" onClick={() => onWeightChange(0)} style={{ border: 0, background: "transparent", color: T.red, fontFamily: T.mono, fontSize: 9, fontWeight: 800, cursor: "pointer", padding: 0 }}>CLEAR</button>
              )}
            </div>
            <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2 }}>
              {BELT_PLATES.map((plate) => <Plate key={plate} value={plate} compact onClick={() => onWeightChange((Number(weight) || 0) + plate)} title={`Add ${plate} pound plate to belt`} />)}
            </div>
          </div>
        </div>
      )}
    />
  );
}

export { BeltPlateVisualizer, decomposeLoad };
