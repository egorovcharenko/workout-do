
// ─── file: workout-session-icons.js ───

(function() {
  if (typeof window === "undefined") return;
  const base = "https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/";
  
  const gifMap = {
    // Core Exercises
    "Pull-Ups": "lats/pull-up.gif",
    "Band Bicep Curls": "biceps/band-alternating-biceps-curl.gif",
    "Band Romanian Deadlift": "glutes/band-stiff-leg-deadlift.gif",
    "Band Row": "upper-back/band-one-arm-standing-low-row.gif",
    "Band Squat": "glutes/band-squat.gif",
    "Band Torso Rotation": "abs/band-horizontal-pallof-press.gif",
    "Cable Tricep Pushdowns": "triceps/cable-pushdown.gif",
    "Band Tricep Pushdowns": "triceps/cable-pushdown.gif",
    "Barbell Back Squat": "glutes/barbell-full-squat.gif",
    "Barbell Bench Press": "pectorals/barbell-bench-press.gif",
    "Barbell RDL": "glutes/barbell-romanian-deadlift.gif",
    "Barbell Shrugs": "traps/barbell-shrug.gif",
    "Bent-Over Barbell Rows": "upper-back/barbell-bent-over-row.gif",
    "Bulgarian Split Squat": "quads/dumbbell-single-leg-split-squat.gif",
    "Cable Torso Rotation": "abs/cable-twist.gif",
    // No dragon flag in the gif DB — bench lying leg raise is the closest.
    "Dragon Fly Progression": "abs/lying-leg-raise-flat-bench.gif",
    "Calf Raises": "calves/dumbbell-standing-calf-raise.gif",
    "Dips": "triceps/triceps-dip.gif",
    "Dumbbell Bent-Over Rows": "upper-back/dumbbell-bent-over-row.gif",
    "Dumbbell Bicep Curls": "biceps/dumbbell-alternate-biceps-curl.gif",
    "Dumbbell Flat Bench Press": "pectorals/dumbbell-bench-press.gif",
    "Dumbbell Hammer Curls": "biceps/dumbbell-hammer-curl.gif",
    "Dumbbell Lateral Raises": "delts/dumbbell-lateral-raise.gif",
    "Dumbbell Romanian Deadlift": "glutes/dumbbell-romanian-deadlift.gif",
    "Dumbbell Shrugs": "traps/dumbbell-shrug.gif",
    "Cable Face Pulls": "delts/cable-standing-rear-delt-row-with-rope.gif",
    "Face Pulls": "delts/cable-standing-rear-delt-row-with-rope.gif",
    "Goblet Squat": "glutes/kettlebell-goblet-squat.gif",
    "Hanging Knee Raise": "abs/hanging-leg-hip-raise.gif",
    "Incline Barbell Press": "pectorals/barbell-incline-bench-press.gif",
    "Incline DB Curls": "biceps/dumbbell-incline-biceps-curl.gif",
    "Incline Dumbbell Press": "pectorals/dumbbell-incline-bench-press.gif",
    "Lat Pulldown": "lats/cable-bar-lateral-pulldown.gif",
    "Low Row": "upper-back/cable-low-seated-row.gif",
    "Lunges": "glutes/dumbbell-lunge.gif",
    "Overhead Dumbbell Press": "delts/dumbbell-standing-overhead-press.gif",
    "Overhead Tricep Extension": "triceps/dumbbell-standing-triceps-extension.gif",
    "Pallof Press": "abs/band-horizontal-pallof-press.gif",
    "Reverse Flyes": "delts/dumbbell-reverse-fly.gif",
    "Seated Overhead Press": "delts/barbell-seated-overhead-press.gif",
    "Single-Arm Cable Lateral Raise": "delts/cable-lateral-raise.gif",
    "Single-Arm Dumbbell Rows": "upper-back/dumbbell-one-arm-bent-over-row.gif",
    "Single-Leg DB RDL": "glutes/dumbbell-single-leg-deadlift.gif",
    // "close-grip military press" is the DB's standard shoulder-width barbell OHP.
    "Standing Overhead Press": "delts/barbell-standing-close-grip-military-press.gif"
  };

  const fallback = `
    <div style="display:flex;width:100%;height:100%;background:#0e1626;align-items:center;justify-content:center">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4b5563" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6.5 6.5 11 11"/>
        <path d="m11 6.5 6.5 6.5"/>
        <path d="m6.5 11 6.5 6.5"/>
      </svg>
    </div>
  `;

  window.getExerciseIcon = function(name) {
    const file = gifMap[name];
    if (!file) return fallback;
    
    // The DB gifs are square with a white background; the media box isn't
    // square, so contain letterboxes them — the bars must be white to blend.
    return `
      <div style="display:flex;width:100%;height:100%;background:#fff;align-items:center;justify-content:center;overflow:hidden">
        <img src="${base}${file}" style="width:100%;height:100%;object-fit:contain;display:block;background:#fff" />
      </div>
    `;
  };
})();
