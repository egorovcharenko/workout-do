"use client";

import { T } from "@/lib/legacy/shared";
import { WeightStepper } from "./Stepper";

function WeightSelectionFrame({ visual, controls, children, compact = false, visualExpanded = false }) {
  return (
    <div style={{
      width: "100%",
      maxWidth: compact ? 520 : undefined,
      display: "flex",
      flexDirection: "column",
      gap: compact ? 8 : 12,
      margin: `${compact ? 9 : 12}px auto 0`,
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: compact ? "minmax(92px, .8fr) minmax(0, 1.2fr)" : "minmax(180px, 1fr) minmax(220px, 1fr)",
        gap: compact ? 10 : 14,
        alignItems: "center",
        minHeight: compact ? 96 : 120,
        padding: compact ? "9px 10px" : "11px 12px",
        background: "rgba(255,255,255,0.015)",
        borderRadius: compact ? 10 : 12,
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{
          position: "relative",
          height: visualExpanded ? (compact ? 112 : 132) : (compact ? 72 : 88),
          alignSelf: visualExpanded ? "start" : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}>
          {visual}
        </div>
        <div style={{ minWidth: 0 }}>{controls}</div>
      </div>
      {children}
    </div>
  );
}

function EquipmentVisual({ kind }) {
  const label = kind === "bodyweight" ? "BODYWEIGHT" : kind === "dumbbell" ? "DUMBBELL" : "WEIGHT";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: T.muted }}>
      {kind === "bodyweight" ? (
        <svg width="52" height="42" viewBox="0 0 52 42" fill="none" aria-hidden="true">
          <circle cx="26" cy="7" r="5" fill="#60A5FA" />
          <path d="M26 14v12m0-8-10 7m10-7 10 7m-10 1-8 11m8-11 8 11" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : kind === "dumbbell" ? (
        <svg width="72" height="34" viewBox="0 0 72 34" fill="none" aria-hidden="true">
          <rect x="20" y="14" width="32" height="6" rx="3" fill="#94A3B8" />
          <rect x="12" y="7" width="9" height="20" rx="2" fill="#60A5FA" />
          <rect x="4" y="10" width="8" height="14" rx="2" fill="#3B82F6" />
          <rect x="51" y="7" width="9" height="20" rx="2" fill="#60A5FA" />
          <rect x="60" y="10" width="8" height="14" rx="2" fill="#3B82F6" />
        </svg>
      ) : (
        <svg width="48" height="42" viewBox="0 0 48 42" fill="none" aria-hidden="true">
          <circle cx="24" cy="21" r="18" fill="rgba(59,130,246,.18)" stroke="#60A5FA" strokeWidth="3" />
          <circle cx="24" cy="21" r="6" fill="#0F172A" stroke="#94A3B8" strokeWidth="2" />
        </svg>
      )}
      <span style={{ color: T.faint, fontFamily: T.mono, fontSize: 8, fontWeight: 800, letterSpacing: 0.7 }}>
        {label}
      </span>
    </div>
  );
}

function EquipmentWeightSelector({ value, last, onPick, kind = "weight", compact = false }) {
  return (
    <WeightSelectionFrame
      compact={compact}
      visual={<EquipmentVisual kind={kind} />}
      controls={(
        <WeightStepper
          value={value}
          last={last}
          onPick={onPick}
          compact={compact}
          showLastHint={false}
          embedded
        />
      )}
    />
  );
}

export { EquipmentWeightSelector, WeightSelectionFrame };
