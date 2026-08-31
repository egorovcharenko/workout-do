"use client";

import styles from "./DurationReadout.module.css";

function formatDuration(seconds) {
  const value = Math.max(0, Math.round(seconds || 0));
  if (value < 90) return `${value}s`;
  return `${Math.max(1, Math.round(value / 60))}m`;
}

function expectedTitle(meta) {
  if (meta.source === "actual") return "Completed duration; expected now equals actual.";
  if (meta.historyExerciseCount) {
    return meta.source === "live"
      ? `Expected workout total uses current pace plus history from ${meta.historyExerciseCount} exercise${meta.historyExerciseCount === 1 ? "" : "s"}.`
      : `Expected workout total blends the plan with history from ${meta.historyExerciseCount} exercise${meta.historyExerciseCount === 1 ? "" : "s"}.`;
  }
  if (meta.source === "live") {
    return meta.sampleCount
      ? `Expected total updated from current pace and ${meta.sampleCount} recent attempt${meta.sampleCount === 1 ? "" : "s"}.`
      : "Expected total updated from current pace and the programmed plan.";
  }
  if (meta.sampleCount) {
    return `Expected duration blends the programmed plan with ${meta.sampleCount} recent attempt${meta.sampleCount === 1 ? "" : "s"}.`;
  }
  return "Expected duration currently falls back to the programmed plan until enough history exists.";
}

function DurationReadout({ meta, variant = "default", showActual = true }) {
  if (!meta || (!meta.plannedSec && !meta.estimatedSec && !meta.actualSec)) return null;
  const showActualMetric = showActual && meta.actualSec > 0;
  const variantClass = styles[variant] || "";
  return (
    <span className={`${styles.readout}${variantClass ? ` ${variantClass}` : ""}`}>
      <span className={styles.metric} title="Programmed setup, work, and rest duration.">
        <span className={styles.label}>Plan</span>
        <span className={styles.value}>{formatDuration(meta.plannedSec)}</span>
      </span>
      <span className={styles.separator}>·</span>
      <span className={`${styles.metric} ${styles.expected}`} title={expectedTitle(meta)}>
        <span className={styles.label}>Expected</span>
        <span className={styles.value}>{formatDuration(meta.estimatedSec)}</span>
      </span>
      {showActualMetric && (
        <>
          <span className={styles.separator}>·</span>
          <span className={`${styles.metric} ${styles.actual}`} title="Measured elapsed time attributed to this exercise in the current workout.">
            <span className={styles.label}>Actual</span>
            <span className={styles.value}>{formatDuration(meta.actualSec)}</span>
          </span>
        </>
      )}
    </span>
  );
}

export { DurationReadout, formatDuration };
