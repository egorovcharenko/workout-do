"use client";

import { T } from "@/lib/legacy/shared";
import styles from "./RestTimer.module.css";

function RestTimer({ rest, onAdd, onSkip, onToggle }) {
  const { left, total, paused, kind } = rest;
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");
  const progress = total > 0 ? Math.max(0, Math.min(100, (1 - left / total) * 100)) : 100;
  const done = left === 0;
  const urgent = !done && !paused && left <= 10;
  const accent = urgent ? "#fb7185" : done ? T.green : kind === "warmup" ? T.amber : T.accentLight;
  const glow = urgent ? "251,113,133" : done ? "52,211,153" : kind === "warmup" ? "251,191,36" : "96,165,250";
  const status = done ? "REST COMPLETE" : paused ? "REST PAUSED" : urgent ? "GET READY" : "RESTING";

  return (
    <section
      className={`${styles.timer}${done ? ` ${styles.done}` : ""}${urgent ? ` ${styles.urgent}` : ""}${paused ? ` ${styles.paused}` : ""}`}
      style={{ "--rest-accent": accent, "--rest-glow": glow }}
      aria-label="Rest timer"
      aria-live={done ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <div className={styles.halo} aria-hidden />
      <div className={styles.content}>
        <div className={styles.readout}>
          <span className={styles.status}><i />{status}</span>
          <strong>{minutes}:{seconds}</strong>
          <small>{done ? "Ready for the next set" : paused ? "Countdown stopped" : "until your next set"}</small>
        </div>

        <div className={styles.controls}>
          <button type="button" onClick={() => onAdd(15)} className={styles.secondary}>+15 sec</button>
          <button type="button" onClick={onToggle} className={styles.secondary} aria-label={paused ? "Resume rest timer" : "Pause rest timer"}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={onSkip} className={styles.primary}>
            {done ? "Start next set" : "Skip rest"}
          </button>
        </div>
      </div>

      <div className={styles.progressTrack} role="progressbar" aria-label="Rest progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <div className={styles.progressFill} style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}

export { RestTimer };
