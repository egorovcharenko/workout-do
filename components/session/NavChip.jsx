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
    <button type="button" key={k} onClick={onClick} aria-label={`Select ${d.kind === "warmup" ? "warm-up" : "working"} set ${k + 1}`} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 2, minWidth: 0, width: "100%", minHeight: 28,
      padding: "3px 2px", borderRadius: 6,
      border: box.border, background: box.background, color: box.color,
      fontFamily: T.mono, fontSize: 12.5, fontWeight: 700,
      fontStyle: "normal", whiteSpace: "nowrap",
      cursor: onClick ? "pointer" : "default",
    }}>
      {d.repsOnly
        ? (d.reps != null ? d.reps : "—")
        : <>{d.lb || "—"}{d.weightMultiplier === 2 && <span style={{ color: box.xColor, fontWeight: 600, fontSize: 10 }}>×2</span>}<span style={{ color: box.xColor, fontWeight: 400, fontSize: 11 }}>×</span>{d.reps != null ? d.reps : "—"}</>}
    </button>
  );
}

export { navSetDisplay, SetChip };
