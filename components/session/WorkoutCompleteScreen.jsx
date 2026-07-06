"use client";
import { T } from "@/lib/legacy/shared";
import { StrengthLevelUpload } from "./StrengthLevelUpload";

// ─── file: workout-session-complete-screen.js ───

function WorkoutCompleteScreen({ workoutName, elapsedSec, totalSets, exercises, sessionDate, onFinish }) {
  const m = Math.floor(elapsedSec / 60);
  const s = String(elapsedSec % 60).padStart(2, "0");

  return (
    <div style={{
      margin: "0 16px 12px",
      padding: "32px 24px",
      background: T.cardBg,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: 16,
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 20,
      boxShadow: "0 10px 30px -8px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02)"
    }}>
      <div style={{ fontSize: 48 }}>🎉</div>
      <h2 style={{
        margin: 0,
        color: T.strong,
        fontSize: 26,
        fontWeight: 800,
        letterSpacing: -0.5,
      }}>
        Workout Complete!
      </h2>
      <p style={{
        margin: 0,
        color: T.muted,
        fontSize: 14,
        lineHeight: 1.5,
        maxWidth: 280,
      }}>
        Awesome effort today! Your workout has been saved to your history.
      </p>

      {/* Stats Box */}
      <div style={{
        width: "100%",
        maxWidth: 320,
        background: "rgba(255,255,255,0.015)",
        border: `1px solid rgba(255,255,255,0.04)`,
        borderRadius: 12,
        padding: "16px 20px",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        margin: "10px 0",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: T.faint, fontSize: 10, fontWeight: 700, fontFamily: T.mono, letterSpacing: 0.6 }}>TIME</span>
          <span style={{ color: T.strong, fontSize: 20, fontWeight: 800, fontFamily: T.mono }}>{m}:{s}</span>
        </div>
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: T.faint, fontSize: 10, fontWeight: 700, fontFamily: T.mono, letterSpacing: 0.6 }}>SETS</span>
          <span style={{ color: T.strong, fontSize: 20, fontWeight: 800, fontFamily: T.mono }}>{totalSets}</span>
        </div>
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: T.faint, fontSize: 10, fontWeight: 700, fontFamily: T.mono, letterSpacing: 0.6 }}>WORKOUT</span>
          <span style={{ color: T.strong, fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>{workoutName}</span>
        </div>
      </div>

      <button
        onClick={onFinish}
        style={{
          width: "100%",
          maxWidth: 320,
          background: `linear-gradient(180deg, ${T.accentLight}, ${T.accent})`,
          border: "none",
          color: T.inv,
          fontFamily: "inherit",
          fontSize: 15,
          fontWeight: 700,
          padding: "12px 0",
          borderRadius: 11,
          cursor: "pointer",
          boxShadow: `0 4px 16px -4px ${T.accent}`,
          transition: "transform 150ms",
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.02)"}
        onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
      >
        Finish & Exit
      </button>

      {/* A deload single (1×1 @ 80%) isn't meaningful Strength Level data. */}
      {window.StrengthLevelUpload && !window.SESSION_DELOAD && (
        <StrengthLevelUpload
          exercises={exercises}
          workoutName={workoutName}
          sessionDate={sessionDate} />
      )}
    </div>
  );
}

export { WorkoutCompleteScreen };
