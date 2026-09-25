export function LoadProgression({ offer, onApply }) {
  if (!offer) return null;
  const reserve = offer.rirLabel || "1–2";
  const condition = offer.practice ? "3 reps left and main squat steady?" : `${reserve} reps left${offer.required === 1 ? "" : " both times"}?`;
  return (
    <div className="load-guidance" data-load-progression={offer.ready ? "ready" : "building"}>
      <span>Next step <strong>{offer.weight} lb × {offer.reps}</strong> <small>for {offer.groupLabel}</small></span>
      {offer.canApply && onApply ? <>
        <span>{condition}</span>
        <button type="button" onClick={onApply}
          aria-label={`Confirm ${offer.practice ? '3 reps in reserve and main squat steady' : `${reserve} reps in reserve${offer.required === 1 ? "" : " in both workouts"}`}; use ${offer.weight} lb for ${offer.groupLabel}`}>
          Yes · use {offer.weight} lb
        </button>
      </> : <span className="load-guidance-status">
        {offer.ready
          ? "Unlocked · use it next workout"
          : `Hit ${offer.upper} reps${offer.setNumbers.length > 1 ? " on every set" : ""} in ${offer.required} ${offer.required === 1 ? "workout" : "workouts"} to unlock · ${offer.qualifying}/${offer.required}`}
      </span>}
    </div>
  );
}
