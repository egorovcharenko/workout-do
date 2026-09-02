const BELT_PLATES = [45, 35, 25, 15, 10, 5, 2.5, 1.25, 0.5];
const BARBELL_PLATES = [45, 35, 25, 15, 10, 5, 2.5, 1, 0.5];
const BARBELL_BAR = 45;

function roundedLoad(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function decomposeBeltLoad(load) {
  const plates = [];
  let remaining = Math.max(0, roundedLoad(load));
  for (const plate of BELT_PLATES) {
    while (remaining >= plate - 0.0001) {
      plates.push(plate);
      remaining = roundedLoad(remaining - plate);
    }
  }
  return plates;
}

// Per-side plates for a barbell total, largest first (the order they sit on
// the sleeve, from the collar out).
function decomposeBarbellLoad(weight, bar = BARBELL_BAR) {
  const plates = [];
  let remaining = roundedLoad((Math.max(bar, Number(weight) || 0) - bar) / 2);
  for (const plate of BARBELL_PLATES) {
    while (remaining >= plate - 0.0001) {
      plates.push(plate);
      remaining = roundedLoad(remaining - plate);
    }
  }
  return plates;
}

// Number of plates (per side) that must come off or go on to move the bar
// from one total to another. Plates stack from the collar out, so anything
// outside the first differing plate has to come off too.
function barbellPlateChanges(fromWeight, toWeight, bar = BARBELL_BAR) {
  const from = decomposeBarbellLoad(fromWeight, bar);
  const to = decomposeBarbellLoad(toWeight, bar);
  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += 1;
  return (from.length - shared) + (to.length - shared);
}

// Picks the weight near `targetWeight` that takes the fewest plate changes
// starting from `fromWeight`. Candidates are multiples of `step` within
// ±`tolerance` of the exact target; ties go to the candidate closest to the
// target, then to the heavier one.
function nearestBarbellWeightByPlateChanges(fromWeight, targetWeight, { tolerance = 5, step = 5, bar = BARBELL_BAR } = {}) {
  const target = Number(targetWeight) || bar;
  const center = Math.max(bar, Math.round(target / step) * step);
  const first = Math.ceil((target - tolerance) / step - 0.0001) * step;
  let best = null;
  for (let candidate = first; candidate <= target + tolerance + 0.0001; candidate += step) {
    const weight = roundedLoad(candidate);
    if (weight < bar) continue;
    const changes = barbellPlateChanges(fromWeight, weight, bar);
    const distance = Math.abs(weight - target);
    if (!best
      || changes < best.changes
      || (changes === best.changes && distance < best.distance - 0.0001)
      || (changes === best.changes && Math.abs(distance - best.distance) < 0.0001 && weight > best.weight)) {
      best = { weight, changes, distance };
    }
  }
  return best ? best.weight : center;
}

function removeBeltPlate(load, plate) {
  return roundedLoad(Math.max(0, roundedLoad(load) - Math.max(0, Number(plate) || 0)));
}

function removeBarbellPlate(load, platePerSide) {
  return roundedLoad(Math.max(45, roundedLoad(load) - Math.max(0, Number(platePerSide) || 0) * 2));
}

export {
  BARBELL_PLATES,
  BELT_PLATES,
  barbellPlateChanges,
  decomposeBarbellLoad,
  decomposeBeltLoad,
  nearestBarbellWeightByPlateChanges,
  removeBarbellPlate,
  removeBeltPlate,
};
