/**
 * Scoped, timestamped console logging (same recipe as block_do).
 * Filter DevTools console by `[workout_do]` to trace auth + Firestore.
 */

const PREFIX = "[workout_do]";

function ts(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function log(scope: string, msg: string, data?: unknown): void {
  if (data !== undefined) {
    console.log(`${PREFIX} ${ts()} [${scope}] ${msg}`, data);
  } else {
    console.log(`${PREFIX} ${ts()} [${scope}] ${msg}`);
  }
}

export function warn(scope: string, msg: string, data?: unknown): void {
  if (data !== undefined) {
    console.warn(`${PREFIX} ${ts()} [${scope}] ${msg}`, data);
  } else {
    console.warn(`${PREFIX} ${ts()} [${scope}] ${msg}`);
  }
}

export function error(scope: string, msg: string, data?: unknown): void {
  if (data !== undefined) {
    console.error(`${PREFIX} ${ts()} [${scope}] ${msg}`, data);
  } else {
    console.error(`${PREFIX} ${ts()} [${scope}] ${msg}`);
  }
}
