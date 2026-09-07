"use client";
import { RIR_OPTIONS, normalizeRir } from "@/lib/legacy/set-rir";

function RirSelector({ value, onPick, context }) {
  const selected = normalizeRir(value);
  const label = context ? `${context} · RIR` : "RIR";
  return (
    <div className="rir-selector" role="group" aria-label={`${label} (optional)`}>
      <span className="rir-selector-label" title={label}>{label}</span>
      {RIR_OPTIONS.map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={selected === option.value}
          aria-label={`${option.label} RIR${selected === option.value ? ", clear" : ""}`}
          onClick={() => onPick(option.value)}
        >{option.label}</button>
      ))}
    </div>
  );
}

export { RirSelector };
