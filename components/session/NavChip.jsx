"use client";
import { T } from "@/lib/legacy/shared";
import { navSetDisplay } from "@/lib/legacy/nav-set-display";

// ─── file: workout-session-nav-chip.js ───

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
    <button type="button" key={k} onClick={onClick} aria-label={`Select ${d.kind === "warmup" ? "warm-up" : "working"} set ${k + 1}${d.lastReps != null ? `; last workout ${d.lastReps} reps` : ""}`} style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, minWidth: 0, width: "100%", minHeight: 28,
      padding: "3px 2px", borderRadius: 6,
      border: box.border, background: box.background, color: box.color,
      fontFamily: T.mono, fontSize: 12.5, fontWeight: 700,
      fontStyle: "normal", whiteSpace: "nowrap",
      cursor: onClick ? "pointer" : "default",
    }}>
      <span style={{ display: "inline-flex", alignItems: "baseline", justifyContent: "center", gap: 2 }}>
      {d.rirLabel
        ? <span style={{ fontSize: 11 }}>{d.lb && d.lb !== "BW" ? `${d.lb} · ` : ''}{d.rirLabel} RIR</span>
        : d.repsOnly
        ? (d.reps != null ? d.reps : "—")
        : <>{d.lb || "—"}{d.weightMultiplier === 2 && <span style={{ color: box.xColor, fontWeight: 600, fontSize: 10 }}>×2</span>}<span style={{ color: box.xColor, fontWeight: 400, fontSize: 11 }}>×</span>{d.reps != null ? d.reps : "—"}</>}
      </span>
      {d.lastReps != null && <span title={d.lastTitle || undefined} style={{ color: d.state === "current" ? "rgba(255,255,255,0.85)" : T.muted, fontSize: 10, fontWeight: 500, lineHeight: 1.2 }}>
        Last <strong style={{ fontWeight: 700 }}>{d.lastReps}</strong>
      </span>}
    </button>
  );
}

export { navSetDisplay, SetChip };
