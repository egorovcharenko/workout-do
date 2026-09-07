"use client";
import { useRef, useState } from "react";
import { buildWorkoutRecap, recapDate, recapDuration } from "@/lib/legacy/workout-recap";
import { StrengthLevelUpload } from "./StrengthLevelUpload";

function WorkoutCompleteScreen({ workoutName, elapsedSec, exercises, sessionDate, testMode = false, onReview, onFinish }) {
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(false);
  const finishPending = useRef(false);
  const recap = buildWorkoutRecap(exercises);
  const handleFinish = () => {
    if (finishPending.current) return;
    finishPending.current = true;
    setFinishing(true);
    setFinishError(false);
    void Promise.resolve().then(onFinish).catch(error => {
      console.error("[V2-SAVE] finish action failed:", error);
      finishPending.current = false;
      setFinishing(false);
      setFinishError(true);
    });
  };

  return (
    <main className="workout-recap-screen">
      <div className="workout-recap-container">
        <article className="workout-recap" aria-label="Workout recap">
          <header className="workout-recap-header">
            <div className="workout-recap-eyebrow">
              <span>{testMode ? "Test workout · not saved" : "Workout complete"}</span>
              <time dateTime={sessionDate}>{recapDate(sessionDate)}</time>
            </div>
            <h1>{workoutName}</h1>
          </header>
          <dl className="workout-recap-metrics">
            <div><dt>Time</dt><dd>{recapDuration(elapsedSec)}</dd></div>
            <div><dt>Working sets</dt><dd>{recap.workingSets}</dd></div>
            <div><dt>Reps</dt><dd>{recap.reps}</dd></div>
          </dl>
          <ol className="workout-recap-exercises">
            {recap.exercises.map((exercise, index) => (
              <li className="workout-recap-exercise" key={index}>
                <div className="workout-recap-exercise-heading">
                  <h2>{exercise.name}</h2>
                  {exercise.workingSets > 0 && <span>{exercise.workingSets} {exercise.workingSets === 1 ? "set" : "sets"}</span>}
                </div>
                {exercise.groups.length ? exercise.groups.map((group, groupIndex) => (
                  <div className="workout-recap-set-group" key={groupIndex}>
                    <span className="workout-recap-load">{group.load}</span>
                    <span className="workout-recap-reps"><span className="workout-recap-times">× </span><strong>{group.reps.join(" · ")}</strong><small> reps</small></span>
                  </div>
                )) : <p className="workout-recap-warmup-only">{exercise.warmupSets} warm-up {exercise.warmupSets === 1 ? "set" : "sets"} only</p>}
              </li>
            ))}
          </ol>
          {recap.exercises.length === 0 && <p className="workout-recap-empty">No sets logged.</p>}
          <footer className="workout-recap-footer">
            <span>{recap.warmupSets > 0 ? `+ ${recap.warmupSets} warm-up ${recap.warmupSets === 1 ? "set" : "sets"}` : `${recap.exercises.length} ${recap.exercises.length === 1 ? "exercise" : "exercises"}`}</span>
            <span className="workout-recap-brand">workouts</span>
          </footer>
        </article>

        <div className="workout-recap-actions">
          <button type="button" onClick={onReview} disabled={finishing}>Review sets</button>
          <button type="button" className="workout-recap-finish" onClick={handleFinish} disabled={finishing} aria-busy={finishing}>
            {finishing ? "Saving & exiting…" : "Finish & exit"}
          </button>
        </div>
        {finishError && <p role="alert" className="workout-recap-error">Couldn’t finish. Try again.</p>}
        {typeof window !== "undefined" && window.StrengthLevelUpload && !window.SESSION_DELOAD && (
          <StrengthLevelUpload exercises={exercises} workoutName={workoutName} sessionDate={sessionDate} />
        )}
      </div>
    </main>
  );
}

export { WorkoutCompleteScreen };
