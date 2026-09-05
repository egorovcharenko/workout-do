import { restackBarbellLoad } from "./plate-load.js";

// Reconstruct the bar from the exercise's ordered loads, starting with an
// empty bar. UI focus, click order, and previously cached layouts are irrelevant.
function platesForExerciseSet(sets, setIndex) {
  let plates = [];
  for (let index = 0; index <= setIndex && index < (sets || []).length; index++) {
    const set = sets[index];
    if (set.userSkipped && index !== setIndex) continue;
    plates = restackBarbellLoad(plates, set.weight ?? 45);
  }
  return plates;
}

export { platesForExerciseSet };
