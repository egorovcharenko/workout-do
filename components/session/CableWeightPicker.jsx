"use client";

import { useEffect, useRef } from "react";
import {
  CABLE_SIDE_MAX,
  CABLE_WEIGHT_STEP,
  cableSides,
  cableWeightBounds,
  cableWeightPerSide,
  clampCableWeight,
} from "@/lib/legacy/cable-stack";
import styles from "./CableWeightPicker.module.css";

const VISUAL_PLATES = 10;
// The quick-pick row offers round multiples of 5 lb inside the lift's own
// range — up to 260 when both arms pull, 130 one side at a time. The +/−
// buttons still adjust by CABLE_WEIGHT_STEP (1 lb), so the 8 lb floor and
// every value between the chips stays reachable.
const DISPLAY_STEP = 5;

function weightChoices(exerciseName) {
  const { min, max } = cableWeightBounds(exerciseName);
  const first = Math.ceil(min / DISPLAY_STEP) * DISPLAY_STEP;
  return Array.from(
    { length: Math.floor((max - first) / DISPLAY_STEP) + 1 },
    (_, index) => first + index * DISPLAY_STEP,
  );
}

function formatWeight(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function LoadGauge({ loadedCount }) {
  return (
    <div className={styles.tower} aria-hidden="true">
      {Array.from({ length: VISUAL_PLATES }, (_, index) => {
        const loaded = index >= VISUAL_PLATES - loadedCount;
        const firstLoaded = loaded && index === VISUAL_PLATES - loadedCount;
        return (
          <span key={index} className={`${styles.plate}${loaded ? ` ${styles.plateLoaded}` : ""}`}>
            {firstLoaded && <i className={styles.pin} />}
          </span>
        );
      })}
    </div>
  );
}

function CableWeightPicker({ exerciseName, value, onPick, compact = false }) {
  const sides = cableSides(exerciseName);
  const bothSides = sides === 2;
  const bounds = cableWeightBounds(exerciseName);
  const requested = Number(value) || 0;
  const weight = clampCableWeight(requested, exerciseName);
  const perSide = cableWeightPerSide(weight, exerciseName);
  const choices = weightChoices(exerciseName);
  const activeRef = useRef(null);
  const loadedCount = Math.max(
    1,
    Math.min(VISUAL_PLATES, Math.round((perSide / CABLE_SIDE_MAX) * VISUAL_PLATES)),
  );
  // The chip the row scrolls to when the weight sits between two of them.
  const scrollTarget = choices.reduce(
    (best, choice) => (Math.abs(choice - weight) < Math.abs(best - weight) ? choice : best),
    choices[0],
  );

  useEffect(() => {
    if (requested !== weight) onPick(weight);
  }, [onPick, requested, weight]);

  useEffect(() => {
    const target = activeRef.current;
    const row = target?.parentElement;
    if (!target || !row) return;
    row.scrollTo({
      left: target.offsetLeft - row.clientWidth / 2 + target.clientWidth / 2,
      behavior: "smooth",
    });
  }, [weight]);

  const pickWeight = (next) => {
    onPick(clampCableWeight(next, exerciseName));
  };
  const step = (delta) => {
    pickWeight(weight + delta);
  };

  const sidesLabel = bothSides ? "both sides" : "per side";

  return (
    <section className={`${styles.selector}${compact ? ` ${styles.compact}` : ""}`}>
      <div className={styles.machine}>
        <div
          className={styles.towers}
          role="img"
          aria-label={bothSides ? "Both sides of the machine" : "One side of the machine"}
        >
          {Array.from({ length: sides }, (_, index) => <LoadGauge key={index} loadedCount={loadedCount} />)}
        </div>

        <div className={styles.controls}>
          <div className={styles.valueRow}>
            <button
              type="button"
              className={styles.adjustButton}
              onClick={() => step(-CABLE_WEIGHT_STEP)}
              aria-label={`Decrease by ${CABLE_WEIGHT_STEP} pound${CABLE_WEIGHT_STEP === 1 ? "" : "s"}`}
              disabled={weight <= bounds.min}
            >
              −
            </button>
            <div className={styles.readout}>
              <span className={styles.number}>{formatWeight(weight)}</span><span className={styles.unit}>lb</span>
              <span className={styles.stackCaption}>{sidesLabel}</span>
            </div>
            <button
              type="button"
              className={styles.adjustButton}
              onClick={() => step(CABLE_WEIGHT_STEP)}
              aria-label={`Increase by ${CABLE_WEIGHT_STEP} pound${CABLE_WEIGHT_STEP === 1 ? "" : "s"}`}
              disabled={weight >= bounds.max}
            >
              +
            </button>
          </div>

          {bothSides && (
            <div className={styles.formula}>
              {formatWeight(weight)} lb total = <strong>{formatWeight(perSide)} lb per side</strong>
            </div>
          )}

        </div>
      </div>

      <div className={styles.pinPicker}>
        <div className={styles.pinRow}>
          {choices.map((choice) => {
            const selected = choice === weight;
            return (
              <button
                key={choice}
                ref={choice === scrollTarget ? activeRef : null}
                type="button"
                className={`${styles.pinChoice}${selected ? ` ${styles.pinChoiceActive}` : ""}`}
                onClick={() => pickWeight(choice)}
                aria-pressed={selected}
                aria-label={`Set ${formatWeight(choice)} pounds ${sidesLabel}`}
              >
                {formatWeight(choice)}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export { CableWeightPicker };
