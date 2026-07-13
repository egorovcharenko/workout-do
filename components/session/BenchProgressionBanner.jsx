import styles from "./BenchProgressionBanner.module.css";

function BenchProgressionBanner({ exercise }) {
  const progression = exercise.progression;
  if (!progression || exercise.planPrescribed) return null;

  const paused = exercise.deload;
  const tone = progression.status === "test"
    ? styles.test
    : progression.status === "achieved"
      ? styles.achieved
      : styles.building;

  return (
    <section className={`${styles.banner} ${tone} ${paused ? styles.paused : ""}`} aria-label="Bench press progression">
      <div className={styles.copy}>
        <span>{paused ? "Deload · progression paused" : "Bench progression · goal 180 × 1"}</span>
        <strong>{paused ? `Next normal session: ${progression.top.weight} lb × ${progression.top.repRange.join("–")}` : progression.headline}</strong>
        <p>{progression.detail}</p>
      </div>
      <div className={styles.target}>
        <small>{progression.status === "test" ? "TEST" : "NEXT"}</small>
        <b>{progression.top.weight}</b>
        <span>lb × {progression.top.repRange[0] === progression.top.repRange[1] ? progression.top.repRange[0] : progression.top.repRange.join("–")}</span>
      </div>
    </section>
  );
}

export { BenchProgressionBanner };
