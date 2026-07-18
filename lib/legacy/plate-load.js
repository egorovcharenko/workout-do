function roundedLoad(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function removeBeltPlate(load, plate) {
  return roundedLoad(Math.max(0, roundedLoad(load) - Math.max(0, Number(plate) || 0)));
}

function removeBarbellPlate(load, platePerSide) {
  return roundedLoad(Math.max(45, roundedLoad(load) - Math.max(0, Number(platePerSide) || 0) * 2));
}

export { removeBarbellPlate, removeBeltPlate };
