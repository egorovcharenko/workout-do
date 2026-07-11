"use client";
import { useState } from "react";
import { T, SWAP_GROUPS, getSwapGroup, getSwapGroupName } from "@/lib/legacy/shared";
import { SetCard } from "./SetCard";
import { RestTimer } from "./RestTimer";
import { ActiveSetBlock } from "./ActiveSetBlock";
import { DurationReadout } from "./DurationReadout";

// ─── file: workout-session-exercise-card.js ───

function ExerciseCardContent({ exercise, sessionTimes, durationMeta, supersetTag, embedded, rest, onRestAdd, onRestSkip, onRestToggle, onPickWeight, onPickBodyweight, onPickGrip, onToggleBand, onClearBands, onLogReps, onSkipWarmup, onSkipExercise, onDeferExercise, onSwapExercise, onReopenSet, onAddSet, onRemoveSet, onRemoveWarmup }) {
  const [showAllFamilies, setShowAllFamilies] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const currentFamilyName = getSwapGroupName(exercise.name) || "Other";

  const swapGroup = getSwapGroup(exercise.name);
  const hasVariants = swapGroup && swapGroup.length > 1;
  const anyLogged = exercise.sets.some(s => s.completed && s.kind === "work");

  if (exercise.skipped) {
    return (
      <div style={{ margin: "0 16px 12px", padding: "10px 14px", background: "rgba(255,255,255,0.015)", border: `1px dashed ${T.cardBorder}`, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 1.0, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>× SKIPPED</span>
          {supersetTag && <span style={{ color: T.bands, fontFamily: T.mono, fontSize: 10, fontWeight: 800, letterSpacing: 1, padding: "1px 5px", borderRadius: 4, background: "rgba(192,132,252,0.10)", opacity: 0.6, flexShrink: 0 }}>{supersetTag}</span>}
          <span style={{ color: T.muted, fontSize: 15, fontWeight: 600, textDecoration: "line-through", textDecorationColor: "rgba(156,163,175,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exercise.name}</span>
        </div>
        <button onClick={onSkipExercise} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: T.muted, padding: "5px 10px", borderRadius: 7, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>↻ restore</button>
      </div>
    );
  }

  const activeIdx = exercise.sets.findIndex(s => s.active);
  const activeSet = activeIdx >= 0 ? exercise.sets[activeIdx] : null;
  const totalWork = exercise.sets.filter(s => s.kind === "work").length;
  const warmups = exercise.sets.filter(s => s.kind === "warmup");
  const totalWarmup = warmups.length;
  const hasWarmup = totalWarmup > 0;
  const warmupActive = warmups.some(s => s.active);
  const activeWarmupPos = activeSet && activeSet.kind === "warmup" ? warmups.indexOf(activeSet) + 1 : null;
  const lastWork = [...exercise.sets].reverse().find(s => s.kind === "work");
  const canRemove = totalWork > 1;



  const footerBtn = (label, onClick, disabled) => (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.06)", color: disabled ? T.disabled : T.muted, padding: "5px 10px", borderRadius: 7, cursor: disabled ? "default" : "pointer", fontSize: 12, fontWeight: 500, opacity: disabled ? 0.5 : 1 }}>{label}</button>
  );

  return (
    <div style={embedded ? {} : {
      margin: "0 16px 12px", padding: "14px 14px 14px",
      background: T.cardBg,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: 14,
    }}>
      {!embedded && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, color: T.strong, fontSize: 20, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.4 }}>
              {supersetTag && (
                <span style={{
                  color: T.bands, fontFamily: T.mono, fontSize: 11, fontWeight: 800, letterSpacing: 1,
                  marginRight: 8, padding: "2px 6px", borderRadius: 5,
                  background: "rgba(192,132,252,0.12)", verticalAlign: "middle",
                }}>{supersetTag}</span>
              )}
              {exercise.name}
            </h2>
            <DurationReadout meta={durationMeta} variant="card" />
          </div>
          {hasVariants && (
            <button
              onClick={() => setShowVariants(v => !v)}
              title="Swap variant"
              style={{
                flexShrink: 0, width: 30, height: 28, padding: 0, borderRadius: 7,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontFamily: "inherit", fontSize: 13, cursor: "pointer",
                border: `1px solid ${showVariants ? "rgba(96,165,250,0.6)" : T.cardBorder}`,
                background: showVariants ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.03)",
                color: showVariants ? T.accentLight : T.faint,
              }}
            >⇄</button>
          )}
        </div>
      )}
      {!embedded && exercise.note && (
        <p style={{ margin: "6px 0 0", color: T.muted, fontSize: 12, lineHeight: 1.4 }}>{exercise.note}</p>
      )}

      {(() => { const dn = exercise.deload && (exercise.sets.find(s => s.deloadNormal) || {}).deloadNormal;
        return dn ? (
          <div style={{
            display: "flex", alignItems: "baseline", gap: 8, padding: "7px 12px", marginTop: 10,
            background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 10,
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, fontFamily: T.mono, color: T.amber }}>DELOAD −20%</span>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.muted }}>
              normal: {dn.weight != null ? `${dn.weight} lb × ` : ""}{dn.sets} set{dn.sets > 1 ? "s" : ""}
            </span>
          </div>
        ) : null; })()}



      {hasVariants && showVariants && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 7,
            color: T.faint, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 1.0,
          }}>
            <span aria-hidden style={{ fontSize: 11 }}>⇄</span>
            CHOOSE VARIANT ({currentFamilyName})
            {anyLogged && (
              <span style={{ marginLeft: "auto", color: T.disabled, fontWeight: 600, letterSpacing: 0.4, textTransform: "none" }}>
                locked — sets logged
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {swapGroup.map(opt => {
              const selected = opt.name === exercise.name;
              const locked = anyLogged && !selected;
              return (
                <button
                  key={opt.name}
                  onClick={selected || locked ? undefined : () => onSwapExercise(opt.name)}
                  disabled={selected || locked}
                  style={{
                    flex: "1 1 auto", minWidth: 0,
                    padding: "10px 14px", borderRadius: 11,
                    fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, letterSpacing: -0.2,
                    textAlign: "center", lineHeight: 1.2,
                    cursor: selected ? "default" : locked ? "not-allowed" : "pointer",
                    transition: "all 160ms ease",
                    border: selected
                      ? "1px solid rgba(96,165,250,0.7)"
                      : `1px solid ${T.cardBorder}`,
                    background: selected
                      ? "linear-gradient(180deg, rgba(96,165,250,0.22), rgba(59,130,246,0.12))"
                      : locked ? "transparent" : "rgba(255,255,255,0.03)",
                    color: selected ? "#DBEAFE" : locked ? T.disabled : T.text,
                    boxShadow: selected ? "0 4px 16px -6px rgba(59,130,246,0.6)" : "none",
                    opacity: locked ? 0.45 : 1,
                  }}
                >
                  {selected && <span aria-hidden style={{ marginRight: 6, color: T.accentLight }}>●</span>}
                  {opt.name}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setShowAllFamilies(!showAllFamilies)}
              style={{
                background: "transparent",
                border: "none",
                color: T.accentLight,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 0",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span>{showAllFamilies ? "▾ Hide other families" : "▸ Swap with another family..."}</span>
            </button>

            {showAllFamilies && (
              <div style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 12,
                background: "rgba(255,255,255,0.015)",
                border: `1px solid ${T.cardBorder}`,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}>
                {SWAP_GROUPS.map(grp => {
                  if (grp.family === currentFamilyName) return null;
                  return (
                    <div key={grp.family} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, borderBottom: `1px dashed rgba(255,255,255,0.06)`, paddingBottom: 2 }}>
                        {grp.family}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {grp.exercises.map(opt => {
                          const locked = anyLogged;
                          return (
                            <button
                              key={opt.name}
                              onClick={locked ? undefined : () => onSwapExercise(opt.name)}
                              disabled={locked}
                              style={{
                                padding: "6px 10px", borderRadius: 8,
                                fontFamily: "inherit", fontSize: 11.5, fontWeight: 600,
                                cursor: locked ? "not-allowed" : "pointer",
                                border: `1px solid ${T.cardBorder}`,
                                background: "rgba(255,255,255,0.02)",
                                color: T.text,
                                opacity: locked ? 0.45 : 1,
                              }}
                            >
                              {opt.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="scroll-row" style={{
        display: "flex",
        overflowX: "auto",
        gap: 6, marginTop: 12,
        paddingBottom: 4,
        WebkitOverflowScrolling: "touch",
      }}>
        {exercise.sets.map((s, i) => (
          <SetCard key={i} s={s} idx={i} exercise={exercise} onReopenSet={onReopenSet}
            dur={sessionTimes && s.logged_at ? sessionTimes.bySet[s.logged_at] : null} />
        ))}
      </div>

      {rest && <RestTimer rest={rest} onAdd={onRestAdd} onSkip={onRestSkip} onToggle={onRestToggle} />}

      {activeSet && (
        <ActiveSetBlock
          exercise={exercise}
          set={activeSet}
          totalWork={totalWork}
          totalWarmup={totalWarmup}
          warmupPos={activeWarmupPos}
          onPickWeight={(w) => onPickWeight(activeIdx, w)}
          onPickBodyweight={(w) => onPickBodyweight(activeIdx, w)}
          onPickGrip={(g) => onPickGrip(activeIdx, g)}
          onToggleBand={(b) => onToggleBand(activeIdx, b)}
          onClearBands={() => onClearBands(activeIdx)}
          onLogReps={(r) => onLogReps(activeIdx, r)}
          onSkipWarmup={onSkipWarmup}
          onApplyLast={() => {
            if (exercise.mode === "bodyweight") {
              onPickBodyweight(activeIdx, activeSet.lastBodyweight || 175);
            } else if (!exercise.isBandsOnly && !exercise.repsOnly) {
              onPickWeight(activeIdx, activeSet.lastWeight || 0);
            }
            if (exercise.grips && activeSet.lastGrip) onPickGrip(activeIdx, activeSet.lastGrip);
            onClearBands(activeIdx);
            (activeSet.lastBands || []).forEach(b => onToggleBand(activeIdx, b));
          }}
        />
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.cardBorder}`, flexWrap: "wrap" }}>
        {embedded && hasVariants && footerBtn(showVariants ? "▾ hide variants" : "⇄ variant", () => setShowVariants(!showVariants))}
        {footerBtn("+ set", onAddSet)}
        {footerBtn("− set", onRemoveSet, !canRemove)}
        {/* Defer: do this exercise later (moves it to the end). Standalone
            exercises only — superset members can't be reordered individually. */}
        {!exercise.superset && onDeferExercise && footerBtn("↓ do later", onDeferExercise)}
        {footerBtn("× skip exercise", onSkipExercise)}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {/* "Skip warmup" lives on the active warm-up set itself (ActiveSetBlock);
              the footer only offers removing the warm-up ramp once past it. */}
          {hasWarmup && !warmupActive && footerBtn("× warmup", onRemoveWarmup)}
        </div>
      </div>
    </div>
  );
}

function ExerciseCard(props) {
  return <ExerciseCardContent key={props.exercise.name} {...props} />;
}

export { ExerciseCard };
