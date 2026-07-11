"use client";

import { useEffect, useRef } from "react";
import {
  CABLE_STACK_MAX,
  CABLE_STACK_MIN,
  CABLE_STACK_STEP,
  cableStackMultiplier,
  cableTotalWeight,
  clampCableStackWeight,
} from "@/lib/legacy/cable-stack";
import styles from "./CableStackVisualizer.module.css";

const VISUAL_PLATES = 10;
const PIN_CHOICES = Array.from(
  { length: (CABLE_STACK_MAX - CABLE_STACK_MIN) / CABLE_STACK_STEP + 1 },
  (_, index) => CABLE_STACK_MIN + index * CABLE_STACK_STEP,
);

function formatWeight(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function StackTower({ loadedCount }) {
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

function CableStackVisualizer({ exerciseName, value, last, onPick, compact = false }) {
  const multiplier = cableStackMultiplier(exerciseName);
  const recordedStackWeight = cableTotalWeight(value, 1);
  const stackWeight = clampCableStackWeight(recordedStackWeight);
  const lastStackWeight = last != null ? clampCableStackWeight(cableTotalWeight(last, 1)) : null;
  const atLast = lastStackWeight != null && stackWeight === lastStackWeight;
  const activeRef = useRef(null);
  const loadedCount = Math.max(1, Math.min(VISUAL_PLATES, Math.round((stackWeight / CABLE_STACK_MAX) * VISUAL_PLATES)));

  useEffect(() => {
    if (recordedStackWeight !== stackWeight) onPick(stackWeight);
  }, [onPick, recordedStackWeight, stackWeight]);

  useEffect(() => {
    const target = activeRef.current;
    const row = target?.parentElement;
    if (!target || !row) return;
    row.scrollTo({
      left: target.offsetLeft - row.clientWidth / 2 + target.clientWidth / 2,
      behavior: "smooth",
    });
  }, [stackWeight]);

  const pickStackWeight = (nextStackWeight) => {
    onPick(cableTotalWeight(clampCableStackWeight(nextStackWeight), 1));
  };
  const stepStack = (delta) => {
    if (delta > 0 && stackWeight < CABLE_STACK_MIN) {
      pickStackWeight(CABLE_STACK_MIN);
      return;
    }
    if (delta < 0 && stackWeight > CABLE_STACK_MAX) {
      pickStackWeight(CABLE_STACK_MAX);
      return;
    }
    pickStackWeight(stackWeight + delta);
  };

  return (
    <section className={`${styles.selector}${compact ? ` ${styles.compact}` : ""}`}>
      <div className={styles.header}>
        <span>{multiplier === 2 ? "Cable stacks · 2 linked" : "Cable stack"}</span>
        {lastStackWeight != null && (
          <button
            type="button"
            className={`${styles.lastButton}${atLast ? ` ${styles.lastButtonMatched}` : ""}`}
            onClick={atLast ? undefined : () => pickStackWeight(lastStackWeight)}
            disabled={atLast}
          >
            LAST {formatWeight(lastStackWeight)}{multiplier === 2 ? "/STACK" : ""}
          </button>
        )}
      </div>

      <div className={styles.machine}>
        <div className={styles.towers} role="img" aria-label={multiplier === 2 ? "Two linked cable stacks" : "One cable stack"}>
          {Array.from({ length: multiplier }, (_, index) => <StackTower key={index} loadedCount={loadedCount} />)}
        </div>

        <div className={styles.controls}>
          <div className={styles.valueRow}>
            <button
              type="button"
              className={styles.adjustButton}
              onClick={() => stepStack(-CABLE_STACK_STEP)}
              aria-label={`Decrease cable stack by ${CABLE_STACK_STEP} pounds`}
              disabled={stackWeight <= CABLE_STACK_MIN}
            >
              −
            </button>
            <div className={styles.readout}>
              <span className={styles.number}>{formatWeight(stackWeight)}</span><span className={styles.unit}>lb</span>
              {multiplier === 2 && <span className={styles.stackCaption}>per stack</span>}
            </div>
            <button
              type="button"
              className={styles.adjustButton}
              onClick={() => stepStack(CABLE_STACK_STEP)}
              aria-label={`Increase cable stack by ${CABLE_STACK_STEP} pounds`}
              disabled={stackWeight >= CABLE_STACK_MAX}
            >
              +
            </button>
          </div>

          {multiplier === 2 && (
            <div className={styles.formula}>
              {formatWeight(stackWeight)} × 2 stacks = <strong>{formatWeight(cableTotalWeight(stackWeight, multiplier))} lb total</strong>
            </div>
          )}

        </div>
      </div>

      <div className={styles.pinPicker}>
        <span className={styles.pinLabel}>
          Stack pin · {CABLE_STACK_MIN}–{CABLE_STACK_MAX} lb · {CABLE_STACK_STEP} lb steps{multiplier === 2 ? " · per stack" : ""}
        </span>
        <div className={styles.pinRow}>
          {PIN_CHOICES.map((pin) => {
            const selected = pin === stackWeight;
            return (
              <button
                key={pin}
                ref={selected ? activeRef : null}
                type="button"
                className={`${styles.pinChoice}${selected ? ` ${styles.pinChoiceActive}` : ""}`}
                onClick={() => pickStackWeight(pin)}
                aria-pressed={selected}
                aria-label={`Set cable stack to ${formatWeight(pin)} pounds${multiplier === 2 ? " per stack" : ""}`}
              >
                {formatWeight(pin)}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export { CableStackVisualizer };
