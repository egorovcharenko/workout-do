// Shared mutable UI state for the home screen modules (from
// workout-ui-shell.js). No module ever reassigns `state` -- only
// property mutation -- so the object is exported directly and every
// importer (and window.state, for inline onclick handlers) shares it.
// State
export let state = {
  screen: "home", // home | measurements
  loaded: false, // true once loadHomeData resolves; home shows shimmers until then
  history: [],
  lastSession: {},
  bodyweight: 175,
};
