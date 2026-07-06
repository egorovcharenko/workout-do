"use client";

// Mechanical port of the vanilla-JS home/shell page from the old app
// (/Users/egorovcharenko/sports/workout.html). The ten UI files that used to
// be concatenated verbatim inside initHomeApp() now live as sibling modules
// (sparklines.js, calendar.js, summary.js, measurementsCard.js, home.js,
// history.js, measurements.js, persistence.js, utils.js, shell.js) sharing
// the mutable `state` object from ./state; only fetch()->api.* calls, the
// /workout -> /session navigation target, and the window attachments below
// were changed from the original.

import { useEffect, useRef } from "react";
import { WORKOUTS } from "@/lib/legacy/shared";
import { setSessionStateCache } from "@/lib/legacy/session-persistence";
import { state } from "./state";
import {
  sparkTip,
  microSparkline,
  _renderSparklineGridLines,
  renderMeasurementSparkline,
  renderPairedMeasurementSparkline,
  MUSCLE_TO_UNIFIED_GROUP,
  METRIC_TO_UNIFIED_GROUP,
  UNIFIED_GROUPS,
} from "./sparklines";
import { renderCalendar, changeCalendarMonth } from "./calendar";
import { renderWorkoutSummaryCard } from "./summary";
import { renderMeasurementsCard } from "./measurementsCard";
import {
  renderWorkoutMuscleMap,
  renderWorkoutCard,
  renderHomeSkeleton,
  renderHome,
  toggleDeload,
} from "./home";
import { getExDurs, renderSessionList } from "./history";
import {
  _measurementPairedSparkline,
  _measurementSparkline,
  _formatMeasurementDate,
  _measurementDelta,
  renderMeasurementsSection,
  renderMeasurements,
  _renderMeasurementForm,
  reloadMeasurements,
  submitMeasurement,
  deleteMeasurement,
} from "./measurements";
import { loadHomeData } from "./persistence";
import { showMeasurements, scrollToSelected } from "./utils";
import { formatTime, startWorkout, render, MUSCLE_GROUPS } from "./shell";

function initHomeApp() {
  // ─── window attachments ───
  // In the old page every top-level `function` declaration of a classic
  // <script> landed on window automatically, which the inline on* handlers in
  // the generated HTML rely on. Inside module scope that no longer happens,
  // so attach them explicitly. `state`, `MUSCLE_GROUPS` and
  // `setSessionStateCache` are included because inline handlers mutate
  // `state.*`, renderWorkoutMuscleMap reads `window.MUSCLE_GROUPS`, and
  // loadHomeData reads `window.setSessionStateCache`.
  Object.assign(window, {
    // workout-ui-home-sparklines.js
    sparkTip,
    microSparkline,
    _renderSparklineGridLines,
    renderMeasurementSparkline,
    renderPairedMeasurementSparkline,
    MUSCLE_TO_UNIFIED_GROUP,
    METRIC_TO_UNIFIED_GROUP,
    UNIFIED_GROUPS,
    // workout-ui-home-calendar.js
    renderCalendar,
    changeCalendarMonth,
    // workout-ui-home-summary.js
    renderWorkoutSummaryCard,
    // workout-ui-home-measurements-card.js
    renderMeasurementsCard,
    // workout-ui-home.js
    renderWorkoutMuscleMap,
    renderWorkoutCard,
    renderHomeSkeleton,
    renderHome,
    toggleDeload,
    // workout-ui-history.js
    getExDurs,
    renderSessionList,
    // workout-ui-measurements.js
    _measurementPairedSparkline,
    _measurementSparkline,
    _formatMeasurementDate,
    _measurementDelta,
    renderMeasurementsSection,
    renderMeasurements,
    _renderMeasurementForm,
    reloadMeasurements,
    submitMeasurement,
    deleteMeasurement,
    // workout-ui-persistence.js
    loadHomeData,
    // workout-ui-utils.js
    showMeasurements,
    scrollToSelected,
    // workout-ui-shell.js
    formatTime,
    startWorkout,
    render,
    MUSCLE_GROUPS,
    state,
    // formerly a global from workout-session-persistence.js (classic script)
    setSessionStateCache,
  });

  // Initial render — check URL hash for deep link
  const initHash = location.hash.replace('#', '');
  const initWorkout = initHash ? WORKOUTS.find(w => w.id === initHash) : null;
  if (initWorkout) {
    startWorkout(initWorkout);
  } else {
    render();
    loadHomeData();
  }
}

export default function HomeApp() {
  const rootRef = useRef(null);

  useEffect(() => {
    initHomeApp();
  }, []);

  return <div id="app" ref={rootRef} />;
}
