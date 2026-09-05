function adjustWeight(value, delta, minimum = 0, quantum = 0.01) {
  const rounded = Math.round((Number(value) + delta) / quantum) * quantum;
  return Math.max(minimum, Math.round(rounded * 100) / 100);
}

export { adjustWeight };
