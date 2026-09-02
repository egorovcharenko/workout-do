import { decomposeBarbellLoad, restackBarbellLoad } from "./plate-load.js";

// What is physically on the bar right now (per side, collar outward). Lives
// outside React so it survives the visualizer remounting between sets of the
// same exercise; a different exercise starts from a freshly loaded bar.
const barStack = { exercise: null, plates: [] };

const sumPlates = (plates) => Math.round(plates.reduce((a, b) => a + b, 0) * 100) / 100;
const totalWeight = (plates) => Math.round((45 + sumPlates(plates) * 2) * 100) / 100;

function currentBarStack(exercise, weight) {
  const load = Math.round(((Math.max(45, weight) - 45) / 2) * 100) / 100;
  if (barStack.exercise !== exercise) {
    barStack.exercise = exercise;
    barStack.plates = decomposeBarbellLoad(weight);
  } else if (sumPlates(barStack.plates) !== load) {
    barStack.plates = restackBarbellLoad(barStack.plates, weight);
  }
  return barStack.plates;
}

// Records a stack the user built by hand and returns the bar total it makes.
function setBarStack(exercise, plates) {
  barStack.exercise = exercise;
  barStack.plates = [...plates];
  return totalWeight(plates);
}

export { currentBarStack, setBarStack };
