import { BARBELL_PLATES, decomposeBarbellLoad, restackBarbellLoad } from "./plate-load.js";
import { LS_PREFIX, localDate } from "./shared.js";

const stacks = new Map();
const totalWeight = plates => Math.round((45 + plates.reduce((sum, p) => sum + p, 0) * 2) * 100) / 100;
const validPlates = plates => Array.isArray(plates) && plates.every(p => BARBELL_PLATES.includes(p));
const keyFor = exercise => `${LS_PREFIX}v3-bar-stack:${localDate()}:${exercise}`;

function readStack(exercise) {
  const key = keyFor(exercise);
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (validPlates(saved)) return saved;
  } catch { /* Storage may be unavailable. */ }
  return stacks.get(key) || null;
}

// Browsing a load only previews a restack; it never changes the loaded bar.
function currentBarStack(exercise, weight) {
  const loaded = readStack(exercise);
  return loaded ? restackBarbellLoad(loaded, weight) : decomposeBarbellLoad(weight);
}

function setBarStack(exercise, plates) {
  if (!validPlates(plates)) throw new Error("Invalid barbell plates");
  const key = keyFor(exercise);
  stacks.set(key, [...plates]);
  try { localStorage.setItem(key, JSON.stringify(plates)); } catch { /* Keep the in-memory fallback. */ }
  return totalWeight(plates);
}

function recordedBarStack(exercise, weight) {
  const plates = readStack(exercise);
  return plates && totalWeight(plates) === weight ? [...plates] : null;
}

function platesForSet(exercise, set) {
  if (validPlates(set.barPlates) && totalWeight(set.barPlates) === set.weight) return [...set.barPlates];
  // Older logs have no plate snapshot. Keep their fallback deterministic.
  if (set.completed) return decomposeBarbellLoad(set.weight);
  return currentBarStack(exercise, set.weight);
}

export { currentBarStack, setBarStack, recordedBarStack, platesForSet };
