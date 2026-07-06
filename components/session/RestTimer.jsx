"use client";
import { T } from "@/lib/legacy/shared";

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

export { RestTimer };
