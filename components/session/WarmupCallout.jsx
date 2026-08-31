"use client";
import { T } from "@/lib/legacy/shared";

// ─── file: workout-session-warmup-callout.js ───

function WarmupCallout({ text }) {
  return (
    <div style={{
      margin: "10px 16px 12px",
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid rgba(217,119,6,0.3)",
      background: "rgba(217,119,6,0.04)",
      display: "flex", gap: 9, alignItems: "center",
    }}>
      <span style={{ fontSize: 13 }}>🔥</span>
      <div style={{ fontSize: 13, lineHeight: 1.35, color: T.amberMuted }}>
        <strong style={{ color: T.amber, fontWeight: 700 }}>Warm-up · </strong>
        {text}
      </div>
    </div>
  );
}

export { WarmupCallout };
