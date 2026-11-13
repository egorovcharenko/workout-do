
// ─── file: workout-session-icons.js ───

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
    "Band Torso Rotation": sprite("cable", 1, 1),
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
    "Cable Bent-Over Rows": sprite("barbell", 1, 1),
    "Cable Bicep Curls": sprite("legs-arms", 1, 1),
    "Cable Chest Press": sprite("barbell", 1, 0),
    "Cable Hammer Curls": sprite("legs-arms", 2, 1),
    "Cable Lateral Raises": sprite("cable", 0, 2),
    "Cable Romanian Deadlift": sprite("barbell", 2, 0),
    "Cable Shrugs": sprite("barbell", 0, 1),
    "Cable Face Pulls": sprite("cable", 2, 0),
    "Face Pulls": sprite("cable", 0, 1),
    "Cable External Rotations": sprite("cable", 1, 1),
    "Cable Goblet Squat": sprite("legs-arms", 1, 0),
    "Hanging Knee Raise": sprite("legs-arms", 2, 2),
    "Decline Abs Crunches": sprite("legs-arms", 2, 2),
    "Incline Barbell Press": sprite("barbell", 2, 1),
    "Incline Cable Curls": sprite("legs-arms", 0, 2),
    "Incline Cable Press": sprite("barbell", 2, 1),
    "Lat Pulldown": sprite("cable", 1, 1),
    "Neutral-Grip Lat Pulldown": sprite("cable", 1, 1),
    "Low Row": sprite("cable", 2, 1),
    "Cable Reverse Lunges": sprite("legs-arms", 2, 0),
    "Cable Overhead Press": sprite("barbell", 1, 2),
    "Overhead Tricep Extension": sprite("legs-arms", 1, 2),
    "Pallof Press": sprite("band", 0, 2),
    "Cable Reverse Flyes": sprite("cable", 0, 2),
    "Seated Cable Overhead Press": sprite("barbell", 0, 2),
    "Single-Arm Cable Lateral Raise": sprite("cable", 0, 2),
    "Single-Arm Cable Rear Delt Fly": sprite("cable", 0, 2),
    "Single-Arm Cable Rows": sprite("cable", 2, 1),
    "Single-Leg Cable RDL": sprite("legs-arms", 0, 1),
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

  /** The artwork for an exercise: a file path, a sprite cell, or null. */
  export function getExerciseImage(name) {
    return imageMap[name] || null;
  }

  export function getExerciseIcon(name) {
    const image = imageMap[name];
    if (!image) return fallback;

    if (typeof image === "object") {
      return `
        <div style="display:flex;width:100%;height:100%;background:#fff;align-items:center;justify-content:center;overflow:hidden">
          <div style="position:relative;width:100%;aspect-ratio:1 / 1;flex:none;overflow:hidden">
            <img src="${image.src}" alt="" aria-hidden="true" style="position:absolute;width:300%;max-width:none;height:${image.height}%;left:-${image.column * 100}%;top:-${image.row * 100}%;display:block" />
          </div>
        </div>
      `;
    }

    return `
      <div style="display:flex;width:100%;height:100%;background:#fff;align-items:center;justify-content:center;overflow:hidden">
        <img src="${image}" alt="" aria-hidden="true" style="width:100%;height:100%;object-fit:contain;display:block;background:#fff" />
      </div>
    `;
  }

// Kept for the legacy inline-HTML callers that still reach for the global.
if (typeof window !== "undefined") window.getExerciseIcon = getExerciseIcon;
