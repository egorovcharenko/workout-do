"use client";
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { T, SWAP_GROUPS } from "@/lib/legacy/shared";
import { ExerciseNavRow } from "./ExerciseNavRow";
import { DurationReadout } from "./DurationReadout";
import { isResolvedSet } from "@/lib/legacy/session-mutations";

// ─── file: workout-session-exercise-nav.js ───

// ExerciseNav — the workout's exercise list. Desktop LEFT pane
// (variant="list", rich) and mobile top strip (variant="strip", compact).
// Tapping a row focuses that exercise in the center column; the App's onSelect
// also activates the exercise's next set so you can log it.

function ExerciseNav({ exercises, durationMeta, shownIdx, currentIdx, onSelect, onSelectSet, onSwapExercise, onAddExercise, variant, isFinished }) {
  const [swapOpenIdx, setSwapOpenIdx] = useState(null);
  const [showAllFamilies, setShowAllFamilies] = useState(false);
  const [showAddLibrary, setShowAddLibrary] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef(null);

  const updateSwapOpenIdx = (value) => {
    setShowAllFamilies(false);
    setSwapOpenIdx(value);
  };
  const closeLibrary = () => {
    setSearchQuery("");
    setShowAddLibrary(false);
  };

  useEffect(() => {
    if (showAddLibrary) {
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showAddLibrary]);

  const STATUS_COLOR = { done: T.green, current: T.accentLight, skipped: T.disabled, upcoming: T.faint };
  const STATUS_GLYPH = { done: "✓", current: "●", skipped: "×", upcoming: "○" };

  const meta = (e, i) => {
    const doneWork = e.sets.filter(isResolvedSet).length;
    const allDone = e.sets.length > 0 && e.sets.every(isResolvedSet);
    let status = "upcoming";
    if (e.skipped) status = "skipped";
    else if (allDone) status = "done";
    else if (i === currentIdx) status = "current";
    return {
      work: e.sets, doneWork, totalWork: e.sets.length, status,
      tag: e.superset ? `${e.superset}${e.supersetPos || ""}` : null,
    };
  };

  const renderLibraryModal = () => {
    if (!showAddLibrary) return null;
    const existingNames = new Set(exercises.map(exercise => exercise.name.trim().toLowerCase()));
    const filteredGroups = SWAP_GROUPS.map(grp => {
      const matchingExercises = grp.exercises.filter(opt =>
        !existingNames.has(opt.name.trim().toLowerCase()) &&
        opt.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      return { ...grp, exercises: matchingExercises };
    }).filter(grp => grp.exercises.length > 0);

    return createPortal(
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)", zIndex: 10000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16
      }} onClick={closeLibrary}>
        <div style={{
          background: T.cardBg, border: `1px solid ${T.cardBorder}`,
          borderRadius: 16, width: "100%", maxWidth: 360,
          maxHeight: "80vh", display: "flex", flexDirection: "column",
          padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
        }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: T.faint, fontWeight: 800, fontFamily: T.mono, letterSpacing: 0.5 }}>ADD EXERCISE FROM LIBRARY</span>
            <button onClick={closeLibrary} style={{
              background: "transparent", border: "none", color: T.accentLight, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 4
            }}>✕</button>
          </div>
          <div style={{ marginBottom: 16 }}>
            <input
              ref={searchInputRef}
              autoFocus
              type="text"
              placeholder="Search exercises..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={{
                width: "100%",
                background: "rgba(255, 255, 255, 0.03)",
                border: searchFocused ? `1px solid ${T.accentLight}` : `1px solid ${T.cardBorder}`,
                boxShadow: searchFocused ? `0 0 8px rgba(96,165,250,0.25)` : "none",
                borderRadius: 10,
                padding: "10px 14px",
                color: T.strong,
                fontFamily: "inherit",
                fontSize: 13,
                outline: "none",
                transition: "all 150ms ease",
              }}
            />
          </div>
          <div style={{
            display: "flex", flexDirection: "column", gap: 12,
            overflowY: "auto", flex: 1, paddingRight: 4
          }}>
            {filteredGroups.length === 0 ? (
              <div style={{ textAlign: "center", color: T.faint, padding: "20px 0", fontSize: 12, fontFamily: T.mono }}>
                No matching exercises found
              </div>
            ) : (
              filteredGroups.map(grp => (
                <div key={grp.family} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, borderBottom: `1px dashed rgba(255,255,255,0.06)`, paddingBottom: 2 }}>
                    {grp.family}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {grp.exercises.map(opt => (
                      <button
                        key={opt.name}
                        onClick={() => { onAddExercise(opt.name); closeLibrary(); }}
                        style={{
                          padding: "6px 10px", borderRadius: 8,
                          fontFamily: "inherit", fontSize: 11.5, fontWeight: 600,
                          cursor: "pointer",
                          border: `1px solid ${T.cardBorder}`,
                          background: "rgba(255,255,255,0.02)",
                          color: T.text,
                        }}
                      >
                        {opt.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  if (variant === "strip") {
    return (
      <React.Fragment>
        <div className="scroll-row" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 16px" }}>
          {exercises.map((e, i) => {
            const m = meta(e, i);
            const sel = i === shownIdx;
            return (
              <button key={e.id} onClick={() => onSelect(i)} style={{
                flex: "0 0 auto", width: 132, textAlign: "left",
                padding: "8px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                border: sel ? `1px solid ${T.accentLight}` : `1px solid ${T.cardBorder}`,
                background: sel ? "rgba(96,165,250,0.14)" : "rgba(255,255,255,0.03)",
                transition: "all 150ms ease",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                  <span style={{ color: STATUS_COLOR[m.status], fontSize: 10, flexShrink: 0 }}>{STATUS_GLYPH[m.status]}</span>
                  {m.tag && <span style={{ color: T.bands, fontFamily: T.mono, fontSize: 9, fontWeight: 800 }}>{m.tag}</span>}
                  <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 9, color: m.status === "done" ? T.green : T.faint }}>{m.doneWork}/{m.totalWork}</span>
                </div>
                <div style={{
                  color: m.status === "skipped" ? T.muted : T.strong,
                  fontSize: 12, fontWeight: 700, lineHeight: 1.25,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                  textDecoration: m.status === "skipped" ? "line-through" : "none",
                  minHeight: 30,
                }}>{e.name}</div>
                <DurationReadout meta={durationMeta?.[i]} variant="nav" />
              </button>
            );
          })}
          {isFinished && (
            <button onClick={() => onSelect(null)} style={{
              flex: "0 0 auto", width: 132, textAlign: "left",
              padding: "8px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
              border: shownIdx === null ? `1px solid ${T.accentLight}` : `1px solid ${T.cardBorder}`,
              background: shownIdx === null ? "rgba(96,165,250,0.14)" : "rgba(255,255,255,0.03)",
              transition: "all 150ms ease",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <span style={{ color: T.green, fontSize: 10, flexShrink: 0 }}>🎉</span>
                <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 9, color: T.green }}>100%</span>
              </div>
              <div style={{
                color: T.strong,
                fontSize: 12, fontWeight: 700, lineHeight: 1.25,
                minHeight: 30,
              }}>Workout Summary</div>
            </button>
          )}
          <button onClick={() => setShowAddLibrary(true)} style={{
            flex: "0 0 auto", width: 132, textAlign: "center",
            padding: "8px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
            border: `1px dashed rgba(96,165,250,0.4)`,
            background: "rgba(96,165,250,0.03)",
            color: T.accentLight, fontWeight: 700, fontSize: 12,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
            minHeight: 52
          }}>
            <span>＋ Add</span>
            <span style={{ fontSize: 9, opacity: 0.8 }}>from Library</span>
          </button>
        </div>
        {renderLibraryModal()}
      </React.Fragment>
    );
  }

  // Desktop list view: group consecutive supersets
  const groups = [];
  exercises.forEach((e, i) => {
    const last = groups[groups.length - 1];
    if (e.superset && last && last.superset === e.superset) last.items.push(i);
    else groups.push({ superset: e.superset || null, items: [i] });
  });

  const cardShell = (i, children) => {
    const sel = i === shownIdx;
    return (
      <div style={{
        borderRadius: 12, overflow: "visible", position: "relative",
        border: sel ? "1px solid rgba(96,165,250,0.6)" : `1px solid ${T.cardBorder}`,
        background: sel ? "rgba(96,165,250,0.10)" : "rgba(255,255,255,0.02)",
        boxShadow: sel ? "0 6px 22px -10px rgba(59,130,246,0.6)" : "none",
        transition: "all 150ms ease",
      }}>{children}</div>
    );
  };

  return (
    <React.Fragment>
      <div style={{ padding: 12, borderRadius: 14, background: T.cardBg, border: `1px solid ${T.cardBorder}` }}>
        <div style={{ color: T.faint, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 1.0, marginBottom: 12, padding: "0 2px" }}>EXERCISES</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {groups.map((g, gi) => {
            if (!g.superset) {
              const i = g.items[0];
              return <React.Fragment key={`g${gi}`}>{cardShell(i, 
                <ExerciseNavRow
                  i={i}
                  exercises={exercises}
                  durationMeta={durationMeta?.[i]}
                  shownIdx={shownIdx}
                  currentIdx={currentIdx}
                  onSelect={onSelect}
                  onSelectSet={onSelectSet}
                  onSwapExercise={onSwapExercise}
                  swapOpenIdx={swapOpenIdx}
                  setSwapOpenIdx={updateSwapOpenIdx}
                  showAllFamilies={showAllFamilies}
                  setShowAllFamilies={setShowAllFamilies}
                />
              )}</React.Fragment>;
            }
            // Superset purple container
            return (
              <div key={`g${gi}`} style={{
                borderRadius: 14, overflow: "visible",
                border: "1px solid rgba(192,132,252,0.28)",
                background: "rgba(192,132,252,0.045)",
                boxShadow: "inset 3px 0 0 rgba(192,132,252,0.65)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 8px", flexWrap: "wrap" }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(192,132,252,0.18)", border: "1px solid rgba(192,132,252,0.35)",
                    color: T.bands, fontSize: 12,
                  }} aria-hidden>⇄</span>
                  <span style={{ color: T.bands, fontFamily: T.mono, fontSize: 11, fontWeight: 800, letterSpacing: 1.2, whiteSpace: "nowrap" }}>SUPERSET {g.superset}</span>
                  <span style={{ color: "rgba(192,132,252,0.65)", fontFamily: T.mono, fontSize: 9, fontWeight: 700, letterSpacing: 1.0, whiteSpace: "nowrap" }}>NO REST BETWEEN</span>
                </div>
                <div style={{ padding: "0 8px 8px" }}>
                  {g.items.map((i, k) => {
                    const sel = i === shownIdx;
                    return (
                      <React.Fragment key={exercises[i].id}>
                        {k > 0 && (
                          <div style={{ display: "flex", justifyContent: "center", margin: "7px 0" }}>
                            <span style={{
                              color: T.bands, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 2,
                              padding: "3px 13px", borderRadius: 99,
                              border: "1px solid rgba(192,132,252,0.4)", background: "rgba(192,132,252,0.10)",
                            }}>THEN</span>
                          </div>
                        )}
                        <div style={{
                          borderRadius: 10, overflow: "visible", position: "relative",
                          border: sel ? "1px solid rgba(96,165,250,0.6)" : "1px solid rgba(255,255,255,0.06)",
                          background: sel ? "rgba(96,165,250,0.10)" : "rgba(0,0,0,0.18)",
                          boxShadow: sel ? "0 6px 22px -10px rgba(59,130,246,0.6)" : "none",
                          transition: "all 150ms ease",
                        }}>
                          <ExerciseNavRow
                            i={i}
                            exercises={exercises}
                            durationMeta={durationMeta?.[i]}
                            shownIdx={shownIdx}
                            currentIdx={currentIdx}
                            onSelect={onSelect}
                            onSelectSet={onSelectSet}
                            onSwapExercise={onSwapExercise}
                            swapOpenIdx={swapOpenIdx}
                            setSwapOpenIdx={updateSwapOpenIdx}
                            showAllFamilies={showAllFamilies}
                            setShowAllFamilies={setShowAllFamilies}
                          />
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {isFinished && (
            <div onClick={() => onSelect(null)} style={{
              borderRadius: 12, overflow: "hidden",
              border: shownIdx === null ? "1px solid rgba(96,165,250,0.6)" : `1px solid ${T.cardBorder}`,
              background: shownIdx === null ? "rgba(96,165,250,0.10)" : "rgba(255,255,255,0.02)",
              boxShadow: shownIdx === null ? "0 6px 22px -10px rgba(59,130,246,0.6)" : "none",
              transition: "all 150ms ease",
              cursor: "pointer",
              padding: "11px 12px",
              display: "flex",
              alignItems: "center",
              gap: 9
            }}>
              <span style={{ fontSize: 14 }}>🎉</span>
              <span style={{ color: T.strong, fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>Workout Summary</span>
              <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 11, fontWeight: 800, color: T.green }}>100%</span>
            </div>
          )}
          <div style={{ marginTop: 12, borderTop: `1px solid ${T.cardBorder}`, paddingTop: 12 }}>
            <button onClick={() => setShowAddLibrary(true)} style={{
              width: "100%", padding: "10px 12px", borderRadius: 12,
              border: `1px dashed rgba(96,165,250,0.4)`, background: "rgba(96,165,250,0.03)",
              color: T.accentLight, fontWeight: 700, fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              transition: "all 150ms ease"
            }}>
              <span>＋</span> Add Exercise from Library
            </button>
          </div>
        </div>
      </div>
      {renderLibraryModal()}
    </React.Fragment>
  );
}

export { ExerciseNav };
