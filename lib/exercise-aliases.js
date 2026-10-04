// Exercise variants ("Barbell Bench Press · Volume"): their own name, so their
// own history, weights and progression, but the base exercise's config,
// equipment and muscles. Map of variant name -> base name, set from settings.
export const VARIANT_SEPARATOR = " · ";
let aliases = {};

export function setExerciseAliases(map) { aliases = { ...(map || {}) }; }
export function exerciseAliases() { return aliases; }
export function baseExerciseName(name) { return aliases[name] || name; }
export function variantName(base, label) { return `${baseExerciseName(base)}${VARIANT_SEPARATOR}${String(label).trim()}`; }
