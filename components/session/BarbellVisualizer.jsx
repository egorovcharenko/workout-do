"use client";
import { T } from "@/lib/legacy/shared";

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
  const compactScale = compact ? 0.68 : 1;
  const scaled = (value) => Math.round(value * compactScale);

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
                height: scaled(getPlateHeight(p)),
                background: PLATE_COLORS[p].bg,
                color: PLATE_COLORS[p].text,
                fontSize: compact ? (p >= 25 ? 10.5 : p >= 10 ? 9.5 : 8) : (p >= 25 ? 12.5 : p >= 10 ? 11 : 9.5),
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
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 12, marginTop: compact ? 9 : 12 }}>
      {/* Barbell load graphic */}
      <div style={{
        position: "relative",
        height: compact ? 62 : 88,
        background: "rgba(255,255,255,0.015)",
        borderRadius: compact ? 10 : 12,
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
        <div style={{ display: "flex", gap: compact ? 3 : 4, justifyContent: "space-between" }}>
          {PLATE_SIZES.map(p => {
            const label = p === 0.5 ? '.5' : p;
            return (
              <button
                key={p}
                onClick={() => handleAddPlate(p)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: compact ? 46 : 72,
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
                    height: scaled(B_HEIGHTS[p]),
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
    </div>
  );
}

export { BarbellVisualizer };
