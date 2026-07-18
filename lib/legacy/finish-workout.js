const DEFAULT_FINISH_TIMEOUT_MS = 2500;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Give the final save a short chance to finish, but never trap the user on the
 * completion screen. The save promise keeps its rejection handler after the
 * timeout wins, so a late Firestore failure cannot become an unhandled error.
 */
async function finishAndExit({
  save,
  exit,
  timeoutMs = DEFAULT_FINISH_TIMEOUT_MS,
  wait = delay,
}) {
  const saveOutcome = Promise.resolve()
    .then(save)
    .then(
      () => ({ status: "saved" }),
      error => ({ status: "failed", error }),
    );
  const timeoutOutcome = Promise.resolve()
    .then(() => wait(timeoutMs))
    .then(() => ({ status: "timed_out" }));

  const outcome = await Promise.race([saveOutcome, timeoutOutcome]);
  exit();
  return outcome;
}

export { DEFAULT_FINISH_TIMEOUT_MS, finishAndExit };
