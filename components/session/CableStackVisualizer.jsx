"use client";

import { useEffect, useRef } from "react";
import {
  CABLE_STACK_ADD_ON_COUNT,
  CABLE_STACK_ADD_ON_WEIGHT,
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
  const { pinWeight, addOnCount } = cableStackSelection(stackWeight);
  const lastStackWeight = last != null ? clampCableStackWeight(cableTotalWeight(last, 1)) : null;
  const atLast = lastStackWeight != null && stackWeight === lastStackWeight;
  const activeRef = useRef(null);
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

  const pickStackWeight = (nextStackWeight) => {
    onPick(cableTotalWeight(clampCableStackWeight(nextStackWeight), 1));
  };
  const pickPinWeight = (nextPinWeight) => {
    onPick(cableStackWeightWithAddOns(nextPinWeight, addOnCount));
  };
  const stepStack = (delta) => {
    pickPinWeight(pinWeight + delta);
  };
  const selectAddOnCount = (nextCount) => {
    onPick(cableStackWeightWithAddOns(pinWeight, nextCount));
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
              aria-label={`Increase cable stack by ${CABLE_STACK_STEP} pounds`}
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

          <div className={styles.addOns}>
            <span className={styles.addOnLabel}>Add-on weights · per stack</span>
            <div className={styles.addOnRow}>
              {Array.from({ length: CABLE_STACK_ADD_ON_COUNT + 1 }, (_, count) => {
                const active = count === addOnCount;
                return (
                  <button
                    key={count}
                    type="button"
                    className={`${styles.addOnButton}${active ? ` ${styles.addOnButtonActive}` : ""}`}
                    onClick={() => selectAddOnCount(count)}
                    aria-pressed={active}
                    aria-label={count === 0
                      ? "Turn off cable stack add-on weights"
                      : `Use ${count} ${CABLE_STACK_ADD_ON_WEIGHT} pound add-on weight${count === 1 ? "" : "s"}${multiplier === 2 ? " per stack" : ""}`}
                  >
                    <span className={styles.addOnIcon} aria-hidden="true">
                      {count === 0 ? "—" : Array.from({ length: count }, (_, index) => <i key={index} />)}
                    </span>
                    <span>{count === 0 ? "OFF" : `${count} × ${formatWeight(CABLE_STACK_ADD_ON_WEIGHT)}`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.pinPicker}>
        <span className={styles.pinLabel}>
          Stack pin · {CABLE_STACK_MIN}–{CABLE_STACK_MAX} lb · {CABLE_STACK_STEP} lb steps{multiplier === 2 ? " · per stack" : ""}
        </span>
        <div className={styles.pinRow}>
          {PIN_CHOICES.map((pin) => {
            const selected = pin === pinWeight;
            return (
              <button
                key={pin}
                ref={selected ? activeRef : null}
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
