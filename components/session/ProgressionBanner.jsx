import styles from "./ProgressionBanner.module.css";

function formatRange(range) {
  return range[0] === range[1] ? String(range[0]) : range.join("–");
}

function ProgressionBanner({ exercise }) {
  const progression = exercise.progression;
  if (!progression || exercise.planPrescribed) return null;

  const paused = exercise.deload;
  const tone = progression.status === "test"
    ? styles.test
    : progression.status === "achieved"
      ? styles.achieved
      : styles.building;
  const label = progression.label || "Bench progression · goal 180 × 1";
  const targetLabel = progression.targetLabel || (progression.status === "test" ? "TEST" : "NEXT");

  return (
    <section className={`${styles.banner} ${tone} ${paused ? styles.paused : ""}`} aria-label={`${progression.exercise} progression`}>
      <div className={styles.copy}>
        <span>{paused ? "Deload · progression paused" : label}</span>
        <strong>{paused ? `Next normal session: ${progression.top.weight} lb × ${formatRange(progression.top.repRange)}` : progression.headline}</strong>
        <p>{progression.detail}</p>
      </div>
      <div className={styles.target}>
        <small>{targetLabel}</small>
        <b>{progression.top.weight}</b>
        <span>lb × {formatRange(progression.top.repRange)}</span>
      </div>
    </section>
  );
}

export { ProgressionBanner };
