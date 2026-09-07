"use client";
import { useState } from "react";

export function useWorkoutCompletion({ isFinished, elapsedSec, scope }) {
  const [completion, setCompletion] = useState(null);
  // Capture the completion transition, not every timer tick. Adjusting this
  // component's state during render also avoids flashing the recap on review.
  if (isFinished && completion?.scope !== scope) {
    setCompletion({ scope, elapsedSec, reviewing: false });
  } else if (!isFinished && completion !== null) {
    setCompletion(null);
  }
  const current = completion?.scope === scope ? completion : null;
  return {
    showRecap: isFinished && !current?.reviewing,
    elapsedSec: isFinished ? (current?.elapsedSec ?? elapsedSec) : elapsedSec,
    review: () => setCompletion(value => value ? { ...value, reviewing: true } : value),
    show: () => setCompletion(value => value ? { ...value, reviewing: false } : value),
  };
}
