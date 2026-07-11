"use client";

import { useEffect, useRef, useState } from "react";
import {
  GRIP_LABELS,
  SWAP_GROUPS,
  getSwapGroup,
  getSwapGroupName,
  stageLabel,
} from "@/lib/legacy/shared";
import { fmtSetDuration } from "@/lib/legacy/session-utils";
import { BarbellVisualizer } from "./BarbellVisualizer";
import { CableStackVisualizer } from "./CableStackVisualizer";
import { cableStackMultiplier, isCableStackExercise } from "@/lib/legacy/cable-stack";
import { RepStrip } from "./RepStrip";
import { RestTimer } from "./RestTimer";
import { BandsGrid, GripSelector, StageSelector, WeightStepper } from "./Stepper";
import { DurationReadout } from "./DurationReadout";
import styles from "./ExerciseCardV2.module.css";

function setLabel(set, allSets) {
  if (set.kind !== "warmup") return String(set.idx).padStart(2, "0");
  const warmups = allSets.filter((candidate) => candidate.kind === "warmup");
  return warmups.length > 1 ? `W${warmups.indexOf(set) + 1}` : "W";
}

function setValue(set, exercise) {
  const reps = set.reps ?? set.lastReps ?? "—";
  if (exercise.repsOnly) return `${reps} reps`;
  if (exercise.stages) return `${stageLabel(exercise.stages, set.grip || set.lastGrip) || "Stage"} · ${reps}`;
  const bands = (set.bands || []).reduce((sum, band) => sum + band, 0);
  if (exercise.isBandsOnly) return `${bands || "—"} × ${reps}`;
  if (exercise.assist) return `BW${bands ? ` − ${bands}` : ""} × ${reps}`;
  const weight = set.weight || set.lastWeight || "—";
  return `${weight}${cableStackMultiplier(exercise.name) === 2 ? "×2" : ""} × ${reps}`;
}

function SetTile({ set, index, exercise, duration, onReopenSet }) {
  const ref = useRef(null);
  useEffect(() => {
    if (set.active) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [set.active]);

  const stateClass = set.active ? styles.setActive : set.completed ? styles.setDone : styles.setNext;
  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.setTile} ${stateClass} ${set.kind === "warmup" ? styles.setWarmup : ""}`}
      onClick={set.active ? undefined : () => onReopenSet(index)}
      disabled={set.active}
    >
      <span className={styles.setNumber}>{setLabel(set, exercise.sets)}</span>
      <strong>{setValue(set, exercise)}</strong>
      <small>{set.active ? "Now" : set.completed ? duration != null ? `Actual ${fmtSetDuration(duration)}` : "Done" : "Next"}</small>
    </button>
  );
}

function ActivePanelV2({ exercise, set, totalWork, totalWarmup, warmupPos, onPickWeight, onPickBodyweight, onPickGrip, onToggleBand, onClearBands, onLogReps, onSkipWarmup, onApplyLast }) {
  const isBodyweight = exercise.mode === "bodyweight";
  const isCable = isCableStackExercise(exercise.name, exercise.equipment);
  const cableMultiplier = cableStackMultiplier(exercise.name);
  const stages = exercise.stages || null;
  const bands = set.bands || [];
  const lastBands = set.lastBands || [];
  const baseWeight = isBodyweight ? set.bodyweight || 0 : set.weight || 0;
  const lastBaseWeight = isBodyweight ? set.lastBodyweight || 0 : set.lastWeight || 0;
  const hasLast = set.lastWeight != null || set.lastBodyweight != null || set.lastReps != null;
  const matchesLast = exercise.repsOnly
    ? set.lastReps != null && (!exercise.grips || set.grip === set.lastGrip)
    : stages
      ? set.lastReps != null && set.grip === set.lastGrip
      : set.lastReps != null &&
        baseWeight === lastBaseWeight &&
        (!exercise.grips || set.grip === set.lastGrip) &&
        bands.length === lastBands.length &&
        bands.every((band) => lastBands.includes(band));
  const rangeMatch = String(exercise.repRange || "").match(/(\d+)\D+(\d+)/);
  const range = rangeMatch ? [parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)] : null;
  const lastBandTotal = lastBands.reduce((sum, band) => sum + band, 0);

  const previousText = exercise.repsOnly
    ? `${set.lastReps || "—"} reps${exercise.grips && set.lastGrip ? ` · ${GRIP_LABELS[set.lastGrip]?.label || set.lastGrip}` : ""}`
    : `${stages ? stageLabel(stages, set.lastGrip) || "—" : `${lastBaseWeight || "—"}${cableMultiplier === 2 ? "×2" : ""}`}${!stages && lastBands.length ? ` ${isBodyweight ? "−" : "+"} ${lastBands.join("+")}` : ""} × ${set.lastReps || "—"}`;

  return (
    <section className={`${styles.activePanel} ${set.kind === "warmup" ? styles.activeWarmup : ""}`}>
      <div className={styles.activeHeading}>
        <div>
          <span>{set.kind === "warmup" ? "Warm-up" : "Working set"}</span>
          <h3>
            {set.kind === "warmup" ? `${warmupPos || 1} / ${totalWarmup}` : `${set.idx} / ${totalWork}`}
          </h3>
        </div>
        <span className={styles.liveBadge}><i /> Live</span>
      </div>

      {hasLast && (
        <button type="button" className={`${styles.previousButton} ${matchesLast ? styles.previousMatched : ""}`} onClick={onApplyLast} disabled={matchesLast}>
          <span><small>Previous</small><b>{previousText}</b>{lastBandTotal > 0 && <em>{lastBandTotal} lb bands</em>}</span>
          <strong>{matchesLast ? "Matched" : "Use"}</strong>
        </button>
      )}

      {exercise.grips && <GripSelector grips={exercise.grips} selected={set.grip} last={set.lastGrip} onPick={onPickGrip} />}
      {stages && <StageSelector stages={stages} selected={set.grip} last={set.lastGrip} onPick={onPickGrip} />}
      {!exercise.isBandsOnly && !stages && !exercise.repsOnly && !isCable && (
        <WeightStepper
          value={baseWeight}
          last={lastBaseWeight || null}
          onPick={isBodyweight ? onPickBodyweight : onPickWeight}
          label={isBodyweight ? "BODYWEIGHT" : null}
          compact
        />
      )}
      {!exercise.isBandsOnly && !stages && !exercise.repsOnly && isCable && (
        <CableStackVisualizer
          exerciseName={exercise.name}
          value={baseWeight || 0}
          last={lastBaseWeight || null}
          onPick={onPickWeight}
          compact
        />
      )}
      {!isBodyweight && exercise.isBarbell && <BarbellVisualizer weight={baseWeight || 45} onWeightChange={onPickWeight} compact />}
      {(exercise.isBandsOnly || exercise.bandAddon || (exercise.assist && exercise.equipment === "band")) && (
        <BandsGrid bands={bands} lastBands={lastBands} onToggle={onToggleBand} onClear={onClearBands} isAssist={exercise.assist} />
      )}

      <div className={styles.repSection}>
        <span>Reps</span>
        <RepStrip min={1} max={20} range={range} last={set.lastReps} logged={set.reps} onLog={onLogReps} compact />
      </div>
      {set.kind === "warmup" && <button type="button" className={styles.skipWarmup} onClick={onSkipWarmup}>Skip remaining warm-ups</button>}
    </section>
  );
}

function VariantPanel({ exercise, swapGroup, currentFamily, anyLogged, showAllFamilies, setShowAllFamilies, onSwapExercise }) {
  return (
    <section className={styles.variantPanel}>
      <div className={styles.variantHeading}><span>{currentFamily}</span>{anyLogged && <small>Locked after logging</small>}</div>
      <div className={styles.variantGrid}>
        {swapGroup.map((option) => {
          const selected = option.name === exercise.name;
          const locked = anyLogged && !selected;
          return <button type="button" key={option.name} className={selected ? styles.variantSelected : ""} disabled={selected || locked} onClick={() => onSwapExercise(option.name)}>{option.name}</button>;
        })}
      </div>
      <button type="button" className={styles.familyToggle} onClick={() => setShowAllFamilies((shown) => !shown)}>{showAllFamilies ? "Hide exercise families" : "All exercise families"}</button>
      {showAllFamilies && (
        <div className={styles.familyList}>
          {SWAP_GROUPS.filter((group) => group.family !== currentFamily).map((group) => (
            <div key={group.family}><span>{group.family}</span><div>{group.exercises.map((option) => <button type="button" key={option.name} disabled={anyLogged} onClick={() => onSwapExercise(option.name)}>{option.name}</button>)}</div></div>
          ))}
        </div>
      )}
    </section>
  );
}

function ExerciseCardV2Content({ exercise, sessionTimes, durationMeta, supersetTag, embedded, rest, onRestAdd, onRestSkip, onRestToggle, onPickWeight, onPickBodyweight, onPickGrip, onToggleBand, onClearBands, onLogReps, onSkipWarmup, onSkipExercise, onDeferExercise, onSwapExercise, onReopenSet, onAddSet, onRemoveSet, onRemoveWarmup }) {
  const [showVariants, setShowVariants] = useState(false);
  const [showAllFamilies, setShowAllFamilies] = useState(false);
  const activeIndex = exercise.sets.findIndex((set) => set.active);
  const activeSet = activeIndex >= 0 ? exercise.sets[activeIndex] : null;
  const workingSets = exercise.sets.filter((set) => set.kind === "work");
  const warmups = exercise.sets.filter((set) => set.kind === "warmup");
  const completed = exercise.sets.filter((set) => set.completed).length;
  const percent = exercise.sets.length ? Math.round((completed / exercise.sets.length) * 100) : 0;
  const swapGroup = getSwapGroup(exercise.name);
  const hasVariants = !!swapGroup && swapGroup.length > 1;
  const anyLogged = workingSets.some((set) => set.completed);
  const deloadNormal = exercise.deload && exercise.sets.find((set) => set.deloadNormal)?.deloadNormal;

  if (exercise.skipped) {
    return (
      <section className={styles.skippedCard}>
        <div><span>Skipped</span><strong>{exercise.name}</strong></div>
        <button type="button" onClick={onSkipExercise}>Restore</button>
      </section>
    );
  }

  const applyLast = () => {
    if (!activeSet) return;
    if (exercise.mode === "bodyweight") onPickBodyweight(activeIndex, activeSet.lastBodyweight || 175);
    else if (!exercise.isBandsOnly && !exercise.repsOnly) onPickWeight(activeIndex, activeSet.lastWeight || 0);
    if (exercise.grips && activeSet.lastGrip) onPickGrip(activeIndex, activeSet.lastGrip);
    onClearBands(activeIndex);
    (activeSet.lastBands || []).forEach((band) => onToggleBand(activeIndex, band));
  };

  return (
    <article className={`${styles.card} ${embedded ? styles.embedded : ""}`}>
      {!embedded && (
        <header className={styles.cardHeader}>
          <div className={styles.headerCopy}>
            <div className={styles.kicker}>
              {supersetTag ? <span>{supersetTag}</span> : <span>Exercise</span>}
              <DurationReadout meta={durationMeta} />
            </div>
            <h2>{exercise.name}</h2>
          </div>
          <div className={styles.headerTools}>
            <div className={styles.progressRing} style={{ "--progress": `${percent * 3.6}deg` }}><span>{completed}</span><small>/{exercise.sets.length}</small></div>
            {hasVariants && <button type="button" className={`${styles.swapButton} ${showVariants ? styles.swapButtonActive : ""}`} onClick={() => setShowVariants((shown) => !shown)} aria-label="Swap exercise">⇄</button>}
          </div>
        </header>
      )}

      {!embedded && exercise.note && <details className={styles.details}><summary>Exercise notes</summary><p>{exercise.note}</p></details>}
      {deloadNormal && <div className={styles.deloadBar}><b>Deload −20%</b><span>Normal: {deloadNormal.weight != null ? `${deloadNormal.weight} lb · ` : ""}{deloadNormal.sets} sets</span></div>}
      {hasVariants && showVariants && <VariantPanel exercise={exercise} swapGroup={swapGroup} currentFamily={getSwapGroupName(exercise.name) || "Other"} anyLogged={anyLogged} showAllFamilies={showAllFamilies} setShowAllFamilies={setShowAllFamilies} onSwapExercise={onSwapExercise} />}

      <div className={styles.setRail}>
        {exercise.sets.map((set, index) => <SetTile key={`${set.kind}-${set.setNumber}-${index}`} set={set} index={index} exercise={exercise} duration={sessionTimes && set.logged_at ? sessionTimes.bySet[set.logged_at] : null} onReopenSet={onReopenSet} />)}
      </div>

      {rest && <div className={styles.restWrap}><RestTimer rest={rest} onAdd={onRestAdd} onSkip={onRestSkip} onToggle={onRestToggle} /></div>}
      {activeSet && (
        <ActivePanelV2
          exercise={exercise}
          set={activeSet}
          totalWork={workingSets.length}
          totalWarmup={warmups.length}
          warmupPos={activeSet.kind === "warmup" ? warmups.indexOf(activeSet) + 1 : null}
          onPickWeight={(weight) => onPickWeight(activeIndex, weight)}
          onPickBodyweight={(weight) => onPickBodyweight(activeIndex, weight)}
          onPickGrip={(grip) => onPickGrip(activeIndex, grip)}
          onToggleBand={(band) => onToggleBand(activeIndex, band)}
          onClearBands={() => onClearBands(activeIndex)}
          onLogReps={(reps) => onLogReps(activeIndex, reps)}
          onSkipWarmup={onSkipWarmup}
          onApplyLast={applyLast}
        />
      )}

      <footer className={styles.cardFooter}>
        {embedded && hasVariants && <button type="button" onClick={() => setShowVariants((shown) => !shown)}>⇄ Variant</button>}
        <button type="button" onClick={onAddSet}>+ Set</button>
        <button type="button" onClick={onRemoveSet} disabled={workingSets.length <= 1}>− Set</button>
        {!exercise.superset && onDeferExercise && <button type="button" onClick={onDeferExercise}>Do later</button>}
        {warmups.length > 0 && !warmups.some((set) => set.active) && <button type="button" onClick={onRemoveWarmup}>Remove warm-up</button>}
        <button type="button" className={styles.skipExercise} onClick={onSkipExercise}>Skip exercise</button>
      </footer>
    </article>
  );
}

function ExerciseCardV2(props) {
  return <ExerciseCardV2Content key={props.exercise.name} {...props} />;
}

export { ExerciseCardV2 };
