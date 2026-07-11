"use client";
import { T, SWAP_GROUPS, getSwapGroup, getSwapGroupName } from "@/lib/legacy/shared";
import { navSetDisplay, SetChip } from "./NavChip";
import { DurationReadout } from "./DurationReadout";

// ─── file: workout-session-nav-row.js ───

function ExerciseNavRow({ i, exercises, durationMeta, shownIdx, currentIdx, onSelect, onSelectSet, onSwapExercise, swapOpenIdx, setSwapOpenIdx, showAllFamilies, setShowAllFamilies }) {
  const e = exercises[i];
  const doneWork = e.sets.filter(s => s.completed).length;
  const allDone = e.sets.length > 0 && e.sets.every(s => s.completed);
  let status = "upcoming";
  if (e.skipped) status = "skipped";
  else if (allDone) status = "done";
  else if (i === currentIdx) status = "current";

  const tag = e.superset ? `${e.superset}${e.supersetPos || ""}` : null;
  const swapGroup = getSwapGroup(e.name);
  const hasVariants = swapGroup && swapGroup.length > 1;
  const workLogged = e.sets.some(s => s.completed && s.kind === "work");
  const swapOpen = swapOpenIdx === i;
  
  const nameColor = status === "skipped" ? T.muted : T.strong;

  const STATUS_COLOR = { done: T.green, current: T.accentLight, skipped: T.disabled, upcoming: T.faint };
  const STATUS_GLYPH = { done: "✓", current: "●", skipped: "×", upcoming: "○" };

  const iconBox = ({ glyph, active, color, bg, border, onClick, title }) => (
    <button
      onClick={onClick}
      title={title}
      style={{
        flexShrink: 0, width: 28, height: 26, padding: 0, borderRadius: 7,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: "inherit", fontSize: 12, lineHeight: 1,
        cursor: onClick ? "pointer" : "default",
        border: border || `1px solid ${active ? "rgba(96,165,250,0.6)" : T.cardBorder}`,
        background: bg || (active ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.03)"),
        color: color || (active ? T.accentLight : T.faint),
      }}
    >{glyph}</button>
  );

  const tagChip = (tag) => (
    <span style={{
      color: T.bandsText, fontFamily: T.mono, fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
      padding: "2px 6px", borderRadius: 5, background: "rgba(192,132,252,0.18)", border: "1px solid rgba(192,132,252,0.3)",
      flexShrink: 0, marginRight: 8,
    }}>{tag}</span>
  );

  const chipRow = (e) => {
    const work = e.sets;
    if (!work.length) return null;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
        {work.map((s, k) => (
          <SetChip
            key={k}
            k={k}
            d={navSetDisplay(s, e)}
            onClick={(ev) => {
              ev.stopPropagation();
              if (onSelectSet) onSelectSet(i, k);
            }}
          />
        ))}
      </div>
    );
  };

  const styleTag = (
    <style>{`
      .exercise-card-media {
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease, border-radius 0.25s ease;
        transform-origin: right center;
        z-index: 10;
      }
      .exercise-card-media:hover {
        transform: scale(2.8);
        box-shadow: 0 12px 36px rgba(0,0,0,0.7);
        z-index: 100;
        border-radius: 8px !important;
        border-left: none !important;
      }
    `}</style>
  );

  return (
    <div style={{ padding: "11px 106px 11px 12px", position: "relative" }}>
      {styleTag}
      <div onClick={() => onSelect(i)} role="button" style={{
        display: "flex", alignItems: "center", gap: 9, cursor: "pointer",
      }}>
        <span style={{ width: 13, textAlign: "center", color: STATUS_COLOR[status], fontSize: 12, flexShrink: 0, marginTop: 0 }}>{STATUS_GLYPH[status]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {tag && tagChip(tag)}
          <span style={{
            color: nameColor, fontSize: 14, fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.3,
            textDecoration: status === "skipped" ? "line-through" : "none",
          }}>
            {e.name}
          </span>
          <DurationReadout meta={durationMeta} variant="nav" />
        </div>
        {hasVariants && iconBox({
          glyph: "⇄", active: swapOpen, title: "Swap variant",
          onClick: (ev) => { ev.stopPropagation(); setSwapOpenIdx(o => o === i ? null : i); },
        })}
        {e.deferred && status !== "done" && iconBox({
          glyph: "↓", color: T.amber, border: "1px solid rgba(251,191,36,0.4)", bg: "rgba(251,191,36,0.12)",
          title: "Deferred — moved to later",
        })}
        <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 800, color: status === "done" ? T.green : T.faint, flexShrink: 0, marginTop: 0 }}>
          {doneWork}/{e.sets.length}
        </span>
      </div>

      <div 
        className="exercise-card-media"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 96,
          background: "rgba(255, 255, 255, 0.02)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          borderTopRightRadius: 11,
          borderBottomRightRadius: 11,
        }}
      >
        {window.getExerciseIcon ? (
          <div dangerouslySetInnerHTML={{ __html: window.getExerciseIcon(e.name) }} style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }} />
        ) : (
          <span style={{ fontSize: 12 }}>📷</span>
        )}
      </div>

      {!e.skipped && hasVariants && swapOpen && (() => {
        const currentFamilyName = getSwapGroupName(e.name) || "Other";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
            <div style={{ color: T.faint, fontFamily: T.mono, fontSize: 9, fontWeight: 700, paddingLeft: 2 }}>
              FAMILY: {currentFamilyName.toUpperCase()}
            </div>
            {swapGroup.map(opt => {
              const isSel = opt.name === e.name;
              const locked = workLogged && !isSel;
              return (
                <button
                  key={opt.name}
                  onClick={(ev) => { ev.stopPropagation(); if (!isSel && !locked) { onSwapExercise(i, opt.name); setSwapOpenIdx(null); } }}
                  disabled={isSel || locked}
                  style={{
                    textAlign: "left", padding: "6px 9px", borderRadius: 7, fontFamily: "inherit",
                    fontSize: 12, fontWeight: 600,
                    cursor: isSel ? "default" : locked ? "not-allowed" : "pointer",
                    border: isSel ? "1px solid rgba(96,165,250,0.6)" : `1px solid ${T.cardBorder}`,
                    background: isSel ? "rgba(96,165,250,0.16)" : locked ? "transparent" : "rgba(255,255,255,0.04)",
                    color: isSel ? "#DBEAFE" : locked ? T.disabled : T.text,
                    opacity: locked ? 0.5 : 1,
                  }}
                >{isSel && <span style={{ color: T.accentLight, marginRight: 6 }}>●</span>}{opt.name}</button>
              );
            })}
            {workLogged && <span style={{ color: T.disabled, fontFamily: T.mono, fontSize: 9, paddingLeft: 2 }}>locked — sets logged</span>}

            <div style={{ marginTop: 4 }}>
              <button
                onClick={(ev) => { ev.stopPropagation(); setShowAllFamilies(!showAllFamilies); }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: T.accentLight,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 2px",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <span>{showAllFamilies ? "▾ Hide other families" : "▸ Other families..."}</span>
              </button>

              {showAllFamilies && (
                <div style={{
                  marginTop: 6,
                  padding: 8,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.01)",
                  border: `1px solid ${T.cardBorder}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  maxHeight: 200,
                  overflowY: "auto",
                }}>
                  {SWAP_GROUPS.map(grp => {
                    if (grp.family === currentFamilyName) return null;
                    return (
                      <div key={grp.family} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ color: T.faint, fontFamily: T.mono, fontSize: 8.5, fontWeight: 700, borderBottom: `1px dashed ${T.cardBorder}`, paddingBottom: 1 }}>
                          {grp.family}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {grp.exercises.map(opt => {
                            const locked = workLogged;
                            return (
                              <button
                                key={opt.name}
                                onClick={(ev) => { ev.stopPropagation(); if (!locked) { onSwapExercise(i, opt.name); setSwapOpenIdx(null); } }}
                                disabled={locked}
                                style={{
                                  textAlign: "left", padding: "4px 6px", borderRadius: 5,
                                  fontFamily: "inherit", fontSize: 11, fontWeight: 600,
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
        );
      })()}

      {!e.skipped && chipRow(e)}
    </div>
  );
}

export { ExerciseNavRow };
