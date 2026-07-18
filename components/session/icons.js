
// ─── file: workout-session-icons.js ───

(function() {
  if (typeof window === "undefined") return;

  const sprite = (sheet, column, row, height = 300) => ({
    src: `/exercises/sprites/${sheet}.png`,
    column,
    row,
    height
  });

  const imageMap = {
    // Core Exercises
    "Pull-Ups": "/exercises/pull-up.png",
    "Band Bicep Curls": sprite("band", 0, 0),
    "Band Romanian Deadlift": sprite("band", 1, 0),
    "Band Row": sprite("band", 2, 0),
    "Band Squat": sprite("band", 0, 1),
    "Band Torso Rotation": sprite("band", 1, 1),
    "Cable Tricep Pushdowns": sprite("cable", 0, 0),
    "Band Tricep Pushdowns": sprite("band", 2, 1),
    "Barbell Back Squat": sprite("barbell", 0, 0),
    "Barbell Bench Press": sprite("barbell", 1, 0),
    "Barbell RDL": sprite("barbell", 2, 0),
    "Barbell Shrugs": sprite("barbell", 0, 1),
    "Bent-Over Barbell Rows": sprite("barbell", 1, 1),
    "Bulgarian Split Squat": sprite("legs-arms", 0, 0),
    "Cable Torso Rotation": sprite("cable", 1, 0),
    "Dragon Fly Progression": "/exercises/dragon-fly/strict-dragon-fly.png",
    "Surf Pop-Up": "/exercises/surf-pop-up-two-step.png",
    "Calf Raises": sprite("barbell", 2, 2),
    "Dips": sprite("cable", 1, 2),
    "Dumbbell Bent-Over Rows": sprite("dumbbell", 0, 2, 323.5),
    "Dumbbell Bicep Curls": sprite("legs-arms", 1, 1),
    "Dumbbell Flat Bench Press": sprite("dumbbell", 0, 0, 323.5),
    "Dumbbell Hammer Curls": sprite("legs-arms", 2, 1),
    "Dumbbell Lateral Raises": sprite("dumbbell", 0, 1, 323.5),
    "Dumbbell Romanian Deadlift": sprite("dumbbell", 2, 2, 323.5),
    "Dumbbell Shrugs": sprite("dumbbell", 2, 1, 323.5),
    "Cable Face Pulls": sprite("cable", 2, 0),
    "Face Pulls": sprite("cable", 0, 1),
    "Goblet Squat": sprite("legs-arms", 1, 0),
    "Hanging Knee Raise": sprite("legs-arms", 2, 2),
    "Incline Barbell Press": sprite("barbell", 2, 1),
    "Incline DB Curls": sprite("legs-arms", 0, 2),
    "Incline Dumbbell Press": sprite("dumbbell", 1, 0, 323.5),
    "Lat Pulldown": sprite("cable", 1, 1),
    "Low Row": sprite("cable", 2, 1),
    "Lunges": sprite("legs-arms", 2, 0),
    "Overhead Dumbbell Press": sprite("dumbbell", 2, 0, 323.5),
    "Overhead Tricep Extension": sprite("legs-arms", 1, 2),
    "Pallof Press": sprite("band", 0, 2),
    "Reverse Flyes": sprite("dumbbell", 1, 1, 323.5),
    "Seated Overhead Press": sprite("barbell", 0, 2),
    "Single-Arm Cable Lateral Raise": sprite("cable", 0, 2),
    "Single-Arm Dumbbell Rows": sprite("dumbbell", 1, 2, 323.5),
    "Single-Leg DB RDL": sprite("legs-arms", 0, 1),
    // "close-grip military press" is the DB's standard shoulder-width barbell OHP.
    "Standing Overhead Press": sprite("barbell", 1, 2)
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
    const image = imageMap[name];
    if (!image) return fallback;

    if (typeof image === "object") {
      return `
        <div style="position:relative;width:100%;height:100%;background:#fff;overflow:hidden">
          <img src="${image.src}" alt="" aria-hidden="true" style="position:absolute;width:300%;max-width:none;height:${image.height}%;left:-${image.column * 100}%;top:-${image.row * 100}%;display:block" />
        </div>
      `;
    }

    return `
      <div style="display:flex;width:100%;height:100%;background:#fff;align-items:center;justify-content:center;overflow:hidden">
        <img src="${image}" alt="" aria-hidden="true" style="width:100%;height:100%;object-fit:contain;display:block;background:#fff" />
      </div>
    `;
  };
})();
