"use client";

import { stageProgression } from "@/lib/legacy/stage-progression";
import styles from "./StageSelector.module.css";

function StageSelector({ stages, selected, last, attempts = [], requiredSets = 2, onPick, compact = false }) {
  if (!stages || stages.length === 0) return null;

  const selectedIndex = Math.max(0, stages.findIndex((stage) => stage.id === selected));
  const selectedStage = stages[selectedIndex];
  const lastStage = stages.find((stage) => stage.id === last) || null;
  const progress = stageProgression(stages, attempts, requiredSets);
  const repsText = progress.reps.map((reps) => reps ?? "—").join(" / ");

  let statusTone = "";
  let statusLabel = "How to start";
  let statusText = "Choose the hardest stage where you can complete at least 3 clean reps. Start at Stage 1 if unsure.";
  let statusAction = null;

  if (progress.mixedStages) {
    statusTone = styles.statusCaution;
    statusLabel = "Use one stage";
    statusText = "Last session mixed stages. Pick one stage for every remaining set so the ladder can measure progress.";
  } else if (progress.mastered && progress.nextStage) {
    statusTone = styles.statusReady;
    statusLabel = `Last: ${progress.previousStage.label} · ${repsText}`;
    statusText = `All ${progress.requiredSets} sets reached ${progress.targetReps}. You are ready for ${progress.nextStage.label}.`;
    statusAction = (
      <button type="button" onClick={() => onPick(progress.nextStage.id)}>
        Use Stage {stages.findIndex((stage) => stage.id === progress.nextStage.id) + 1} →
      </button>
    );
  } else if (progress.masteredTopStage) {
    statusTone = styles.statusReady;
    statusLabel = `Top stage · ${repsText}`;
    statusText = "You mastered the ladder. Keep strict full-range reps or add difficulty outside this progression.";
  } else if (progress.complete && progress.previousStage) {
    statusLabel = `Last: ${progress.previousStage.label} · ${repsText}`;
    statusText = `Stay here until every set reaches ${progress.targetReps} clean reps, then move up one stage next workout.`;
  } else if (progress.hasHistory) {
    statusTone = styles.statusCaution;
    statusLabel = "Incomplete baseline";
    statusText = "Log both working sets at the same stage to get an advancement recommendation next workout.";
  }

  return (
    <section className={`${styles.selector}${compact ? ` ${styles.compact}` : ""}`}>
      <header className={styles.header}>
        <div>
          <span>Dragon flag ladder</span>
          <strong>Stage {selectedIndex + 1} of {stages.length}</strong>
        </div>
        {lastStage && lastStage.id !== selectedStage.id && (
          <button type="button" className={styles.useLast} onClick={() => onPick(lastStage.id)}>
            Use last · {lastStage.label}
          </button>
        )}
      </header>

      <div className={styles.guide}>
        <figure className={styles.demo}>
          {selectedStage.demoUrl && (
            // The source animation is resized and compressed by WordPress's image CDN.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={selectedStage.id}
              src={selectedStage.demoUrl}
              alt={selectedStage.demoAlt || `${selectedStage.label} animated demonstration`}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          )}
          <figcaption>
            <span>{selectedStage.demoCaption}</span>
            {selectedStage.demoSourceUrl && (
              <a href={selectedStage.demoSourceUrl} target="_blank" rel="noreferrer">Source ↗</a>
            )}
          </figcaption>
        </figure>

        <div className={styles.stageCopy}>
          <div className={styles.stageTitle}>
            <span>{String(selectedIndex + 1).padStart(2, "0")}</span>
            <div><strong>{selectedStage.label}</strong><small>{selectedStage.hint}</small></div>
          </div>
          <p>{selectedStage.how}</p>
          <ul>
            {(selectedStage.cues || []).map((cue) => <li key={cue}>{cue}</li>)}
          </ul>
          <div className={styles.repRule}><span>Count 1 rep when</span><strong>{selectedStage.repRule}</strong></div>
        </div>
      </div>

      <div className={styles.rules} aria-label="Dragon flag progression rules">
        <div><b>1</b><span><strong>Choose</strong><small>Hardest stage for 3+ clean reps</small></span></div>
        <div><b>2</b><span><strong>Move up</strong><small>{requiredSets} sets × 8 clean reps</small></span></div>
        <div><b>3</b><span><strong>Drop back</strong><small>If hips fold, back arches, or control breaks</small></span></div>
      </div>

      <div className={`${styles.status} ${statusTone}`}>
        <span><small>{statusLabel}</small><strong>{statusText}</strong></span>
        {statusAction}
      </div>

      <div className={styles.ladder}>
        {stages.map((stage, index) => {
          const isSelected = stage.id === selectedStage.id;
          const wasLast = stage.id === lastStage?.id;
          const isReady = stage.id === progress.nextStage?.id;
          return (
            <button
              key={stage.id}
              type="button"
              className={`${styles.stageButton}${isSelected ? ` ${styles.stageSelected}` : ""}${isReady ? ` ${styles.stageReady}` : ""}`}
              onClick={() => onPick(stage.id)}
              aria-pressed={isSelected}
              aria-label={`Stage ${index + 1}: ${stage.label}. ${stage.hint}`}
            >
              <span className={styles.stageNumber}>{index + 1}</span>
              <span className={styles.stageButtonCopy}><strong>{stage.label}</strong><small>{stage.hint}</small></span>
              <span className={styles.stageMarkers}>{wasLast && <i>Last</i>}{isReady && <i>Ready</i>}</span>
            </button>
          );
        })}
      </div>
      <p className={styles.applyNote}>Stage changes apply to every unfinished working set.</p>
    </section>
  );
}

export { StageSelector };
