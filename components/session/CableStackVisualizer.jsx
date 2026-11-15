"use client";

import { useEffect, useRef } from "react";
import {
  CABLE_STACK_MAX,
  CABLE_STACK_MIN,
  CABLE_STACK_STEP,
  cableStackMultiplier,
  cableStackSelection,
  cableTotalWeight,
  clampCableStackWeight,
  cableStackWeightWithAddOns,
} from "@/lib/legacy/cable-stack";
import styles from "./CableStackVisualizer.module.css";

const VISUAL_PLATES = 10;
// The pin row offers quick jumps on round multiples of 5 lb, starting at the
// first one the stack allows (the 8 lb minimum rounds up to 10). Anchoring the
// row to the minimum instead gave 8/13/18/23, which nobody reads as a weight.
// The +/− buttons still adjust by CABLE_STACK_STEP (1 lb), so the minimum and
// every value between the chips stays reachable.
const PIN_DISPLAY_STEP = 5;
const FIRST_PIN_CHOICE = Math.ceil(CABLE_STACK_MIN / PIN_DISPLAY_STEP) * PIN_DISPLAY_STEP;
const PIN_CHOICES = Array.from(
  { length: Math.floor((CABLE_STACK_MAX - FIRST_PIN_CHOICE) / PIN_DISPLAY_STEP) + 1 },
  (_, index) => FIRST_PIN_CHOICE + index * PIN_DISPLAY_STEP,
);

/** The chip to scroll to when the pin sits between two of them. */
function nearestPinChoice(pinWeight) {
  return PIN_CHOICES.reduce(
    (best, pin) => (Math.abs(pin - pinWeight) < Math.abs(best - pinWeight) ? pin : best),
    PIN_CHOICES[0],
  );
}

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

function CableStackVisualizer({ exerciseName, value, onPick, compact = false }) {
  const multiplier = cableStackMultiplier(exerciseName);
  const recordedStackWeight = cableTotalWeight(value, 1);
  const stackWeight = clampCableStackWeight(recordedStackWeight);
  const { pinWeight } = cableStackSelection(stackWeight);
  const activeRef = useRef(null);
  const scrollTarget = nearestPinChoice(pinWeight);
  const loadedCount = Math.max(1, Math.min(VISUAL_PLATES, Math.round((pinWeight / CABLE_STACK_MAX) * VISUAL_PLATES)));

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
  }, [pinWeight]);

  const pickPinWeight = (nextPinWeight) => {
    onPick(cableStackWeightWithAddOns(nextPinWeight, 0));
  };
  const stepStack = (delta) => {
    pickPinWeight(pinWeight + delta);
  };

  return (
    <section className={`${styles.selector}${compact ? ` ${styles.compact}` : ""}`}>
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
              aria-label={`Decrease cable stack by ${CABLE_STACK_STEP} pound${CABLE_STACK_STEP === 1 ? "" : "s"}`}
              disabled={pinWeight <= CABLE_STACK_MIN}
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
              aria-label={`Increase cable stack by ${CABLE_STACK_STEP} pound${CABLE_STACK_STEP === 1 ? "" : "s"}`}
              disabled={pinWeight >= CABLE_STACK_MAX}
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
        <div className={styles.pinRow}>
          {PIN_CHOICES.map((pin) => {
            const selected = pin === pinWeight;
            return (
              <button
                key={pin}
                ref={pin === scrollTarget ? activeRef : null}
                type="button"
                className={`${styles.pinChoice}${selected ? ` ${styles.pinChoiceActive}` : ""}`}
                onClick={() => pickPinWeight(pin)}
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
