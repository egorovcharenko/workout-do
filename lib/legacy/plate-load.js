const BELT_PLATES = [45, 35, 25, 15, 10, 5, 2.5, 1.25, 0.5];

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

function removeBeltPlate(load, plate) {
  return roundedLoad(Math.max(0, roundedLoad(load) - Math.max(0, Number(plate) || 0)));
}

function removeBarbellPlate(load, platePerSide) {
  return roundedLoad(Math.max(45, roundedLoad(load) - Math.max(0, Number(platePerSide) || 0) * 2));
}

export { BELT_PLATES, decomposeBeltLoad, removeBarbellPlate, removeBeltPlate };
