"use client";
import { useState, useEffect } from "react";
import { T, estimateTemplateWorkoutDuration } from "@/lib/legacy/shared";

// ─── file: workout-session-header.js ───

function Header({ workout, workouts, onPickWorkout, done, total, elapsedSec, running, onToggleTimer, deload }) {
  const pct = total ? (done / total) * 100 : 0;
  const m = Math.floor(elapsedSec / 60);
  const s = String(elapsedSec % 60).padStart(2, "0");
  const [open, setOpen] = useState(false);
  const hasMultiple = (workouts || []).length > 1;

  useEffect(() => {
    if (!open || !hasMultiple) return;
    const onDoc = (e) => {
      if (!e.target.closest || !e.target.closest("[data-workout-menu]")) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open, hasMultiple]);

  return (
    <div style={{ background: T.page, padding: "14px 18px 14px", position: "sticky", top: 0, zIndex: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <a href="/" style={{ color: T.accent, fontSize: 16, fontWeight: 600, textDecoration: "none", flexShrink: 0 }} title="Home">← Back</a>
          <div data-workout-menu style={{ position: "relative", minWidth: 0 }}>
            <button onClick={hasMultiple ? () => setOpen(o => !o) : undefined} style={{
              background: "transparent", border: 0, color: T.strong,
              fontSize: 17, fontWeight: 700, letterSpacing: -0.3,
              padding: 0, cursor: hasMultiple ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6,
              maxWidth: "100%",
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workout.name}</span>
              {hasMultiple && <span style={{ color: T.faint, fontSize: 12, transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 160ms ease" }}>▾</span>}
            </button>
            {hasMultiple && open && (
              <div style={{
                position: "absolute", top: "100%", left: 0, marginTop: 6,
                background: "#0f1722", border: `1px solid ${T.cardBorder}`,
                borderRadius: 10, padding: 4, minWidth: 200, zIndex: 10,
                boxShadow: "0 10px 30px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
              }}>
                {workouts.map(w => {
                  const sel = w.id === workout.id;
                  return (
                    <button key={w.id} onClick={() => { setOpen(false); onPickWorkout(w.id); }} style={{
                      display: "block", width: "100%", textAlign: "left",
                      background: sel ? "rgba(59,130,246,0.12)" : "transparent",
                      border: 0,
                      color: sel ? T.accentLight : T.text,
                      fontSize: 14, fontWeight: sel ? 700 : 500,
                      padding: "9px 12px", borderRadius: 7, cursor: "pointer",
                    }}>
                      {w.name}
                      <span style={{ marginLeft: 8, color: T.faint, fontSize: 11, fontWeight: 500 }}>~{Math.round(estimateTemplateWorkoutDuration(w) / 60)} min</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {deload && (
            <span style={{
              color: "#fbbf24", background: "rgba(251,191,36,0.12)",
              border: "1px solid rgba(251,191,36,0.4)",
              fontFamily: T.mono, fontSize: 10, fontWeight: 800, letterSpacing: 1,
              padding: "2px 6px", borderRadius: 5, flexShrink: 0, whiteSpace: "nowrap",
            }}>DELOAD</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ color: T.faint, fontFamily: T.mono, fontSize: 12, fontWeight: 600 }}>{done}/{total}</span>
          {elapsedSec > 0 ? (
            <div
              style={{
                background: "rgba(52,211,153,0.12)",
                border: `1px solid rgba(52,211,153,0.45)`,
                color: T.green,
                fontFamily: T.mono, fontWeight: 700, fontSize: 13,
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 11px", borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 11 }}>⏱</span>
              <span>Active</span>
              <span style={{ opacity: 0.45 }}>·</span>
              <span style={{ letterSpacing: -0.3 }}>{m}:{s}</span>
            </div>
          ) : (
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${T.cardBorder}`,
                color: T.faint,
                fontFamily: T.mono, fontWeight: 700, fontSize: 13,
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 11px", borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 11 }}>▶</span>
              <span>Not Started</span>
              <span style={{ opacity: 0.45 }}>·</span>
              <span style={{ letterSpacing: -0.3 }}>0:00</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: T.accent, borderRadius: 99, transition: "width 240ms ease" }} />
      </div>
    </div>
  );
}

export { Header };
