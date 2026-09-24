"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { workoutDisplayName, T, estimateTemplateWorkoutDuration } from "@/lib/legacy/shared";
import { DurationReadout } from "./DurationReadout";
import { SaveStatus } from "./SaveStatus";

// ─── file: workout-session-header.js ───

function Header({ workout, workouts, onPickWorkout, onAbandon, abandonSummary, done, total, elapsedSec, durationMeta, deload, homeHref = "/" }) {
  const pct = total ? (done / total) * 100 : 0;
  const m = Math.floor(elapsedSec / 60);
  const s = String(elapsedSec % 60).padStart(2, "0");
  const [open, setOpen] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const hasMultiple = (workouts || []).length > 1;
  const hasMenu = hasMultiple || !!onAbandon;

  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const [abandonError, setAbandonError] = useState(null);

  const closeAbandon = () => {
    if (abandoning) return;
    setConfirmingAbandon(false);
    setAbandonError(null);
  };

  const handleAbandon = async () => {
    if (abandoning || !onAbandon) return;
    setAbandoning(true);
    setAbandonError(null);
    try {
      await onAbandon();
    } catch (error) {
      console.error("[V2-SAVE] abandon action failed:", error);
      setAbandonError("Could not delete the workout. Your progress is still saved — check your connection and try again.");
      setAbandoning(false);
    }
  };

  useEffect(() => {
    if (!open || !hasMenu) return;
    const onDoc = (e) => {
      if (!e.target.closest || !e.target.closest("[data-workout-menu]")) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open, hasMenu]);

  return (
    <div className="session-header glass-bar" style={{ padding: "14px 18px 14px", position: "sticky", top: 0, zIndex: 5 }}>
      <div className="session-header-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Link href={homeHref} style={{ color: T.accent, fontSize: 16, fontWeight: 600, textDecoration: "none", flexShrink: 0 }} title="Home">← Back</Link>
          <div data-workout-menu style={{ position: "relative", minWidth: 0 }}>
            <button
              onClick={hasMenu ? () => setOpen(o => !o) : undefined}
              aria-haspopup={hasMenu ? "menu" : undefined}
              aria-expanded={hasMenu ? open : undefined}
              style={{
              background: "transparent", border: 0, color: T.strong,
              fontSize: 17, fontWeight: 700, letterSpacing: -0.3,
              padding: 0, cursor: hasMenu ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6,
              maxWidth: "100%",
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workoutDisplayName(workout.name)}</span>
              {hasMenu && <span style={{ color: T.faint, fontSize: 12, transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 160ms ease" }}>▾</span>}
            </button>
            {hasMenu && open && (
              <div role="menu" style={{
                position: "absolute", top: "100%", left: 0, marginTop: 6,
                background: "#0f1722", border: `1px solid ${T.cardBorder}`,
                borderRadius: 10, padding: 4, minWidth: 200, zIndex: 10,
                boxShadow: "0 10px 30px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
              }}>
                {hasMultiple && workouts.map(w => {
                  const sel = w.id === workout.id;
                  return (
                    <button role="menuitem" key={w.id} onClick={() => { setOpen(false); onPickWorkout(w.id); }} style={{
                      display: "block", width: "100%", textAlign: "left",
                      background: sel ? "rgba(59,130,246,0.12)" : "transparent",
                      border: 0,
                      color: sel ? T.accentLight : T.text,
                      fontSize: 14, fontWeight: sel ? 700 : 500,
                      padding: "9px 12px", borderRadius: 7, cursor: "pointer",
                    }}>
                      {workoutDisplayName(w.name)}
                      <span style={{ marginLeft: 8, color: T.faint, fontSize: 11, fontWeight: 500 }}>plan {Math.round(estimateTemplateWorkoutDuration(w) / 60)}m</span>
                    </button>
                  );
                })}
                {onAbandon && (
                  <div style={{ borderTop: `1px solid ${T.cardBorder}`, marginTop: 4, paddingTop: 4 }}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setOpen(false); setConfirmingAbandon(true); }}
                      disabled={abandoning}
                      aria-busy={abandoning}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 12px",
                        background: "transparent",
                        border: 0,
                        borderRadius: 7,
                        color: "rgba(248,113,113,0.72)",
                        fontSize: 11,
                        fontWeight: 500,
                        cursor: abandoning ? "wait" : "pointer",
                        opacity: abandoning ? 0.55 : 1,
                      }}
                    >
                      {abandoning ? "Abandoning…" : "Abandon this workout…"}
                    </button>
                  </div>
                )}
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
          <div
            aria-label={`Elapsed ${m} minutes ${s} seconds`}
            style={{
              background: elapsedSec > 0 ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${elapsedSec > 0 ? "rgba(52,211,153,0.45)" : T.cardBorder}`,
              color: elapsedSec > 0 ? T.green : T.faint,
              fontFamily: T.mono, fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums",
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 9px", borderRadius: 8,
            }}
          >
            <span aria-hidden style={{ fontSize: 11 }}>{elapsedSec > 0 ? "⏱" : "▶"}</span>
            <span style={{ letterSpacing: -0.3 }}>{m}:{s}</span>
          </div>
        </div>
      </div>
      <div className="session-header-plan" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, minHeight: 20 }}>
        {durationMeta ? <DurationReadout meta={durationMeta} variant="header" showActual={false} /> : <span />}
        <SaveStatus />
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: T.accent, borderRadius: 99, transition: "width 240ms ease" }} />
      </div>
      {confirmingAbandon && (
        <AbandonDialog
          workoutName={workoutDisplayName(workout.name)}
          summary={abandonSummary}
          elapsedSec={elapsedSec}
          abandoning={abandoning}
          error={abandonError}
          onCancel={closeAbandon}
          onConfirm={handleAbandon}
        />
      )}
    </div>
  );
}

function AbandonDialog({ workoutName, summary, elapsedSec, abandoning, error, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  // The header re-renders every second (elapsed timer); keep the latest
  // handler in a ref so focus and the Escape listener are set up only once.
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; });
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCancelRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const sets = summary?.loggedSets ?? 0;
  const exercises = summary?.exercises ?? 0;
  const minutes = Math.round((elapsedSec || 0) / 60);
  const parts = [
    `${sets} logged ${sets === 1 ? "set" : "sets"}${exercises ? ` across ${exercises} ${exercises === 1 ? "exercise" : "exercises"}` : ""}`,
    minutes ? `${minutes} min` : null,
  ].filter(Boolean);
  const button = {
    flex: 1, minHeight: 48, borderRadius: 12, fontSize: 15, fontWeight: 700,
    cursor: abandoning ? "wait" : "pointer", border: `1px solid ${T.cardBorder}`,
  };

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="abandon-title"
        aria-describedby="abandon-body"
        className="glass-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420, borderRadius: 20, padding: 20,
        }}
      >
        <h2 id="abandon-title" style={{ margin: 0, color: T.strong, fontSize: 18, fontWeight: 700 }}>Abandon {workoutName}?</h2>
        <p id="abandon-body" style={{ margin: "8px 0 0", color: T.text, fontSize: 14, lineHeight: 1.5 }}>
          This permanently deletes today&apos;s session: {parts.join(" · ")}. It can&apos;t be undone.
        </p>
        {error && <p role="alert" style={{ margin: "10px 0 0", color: T.red, fontSize: 13, lineHeight: 1.45 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={abandoning}
            style={{ ...button, background: "rgba(255,255,255,0.06)", color: T.text }}>
            Keep workout
          </button>
          <button type="button" onClick={onConfirm} disabled={abandoning} aria-busy={abandoning}
            style={{ ...button, background: "rgba(248,113,113,0.16)", borderColor: "rgba(248,113,113,0.5)", color: T.red, opacity: abandoning ? 0.6 : 1 }}>
            {abandoning ? "Deleting…" : "Delete workout"}
          </button>
        </div>
      </div>
    </div>
  );
}

export { Header };
