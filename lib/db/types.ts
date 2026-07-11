// Field names deliberately mirror the old Postgres/SQLite schema so the
// ported UI code (which reads weight_lb / bands_json / set_type / ...) needs
// no changes. Sets are EMBEDDED in the session doc — a session is ~25 sets,
// a few KB, far under Firestore's 1 MB doc limit — which turns the old
// "delete all sets + reinsert" save into a single doc write.

export type SetRow = {
  exercise: string;
  set_type: "warmup" | "working";
  set_number: number;
  reps: string | number | null;
  weight_lb: number | null;
  bands_json: string | null;
  grip: string | null;
  completed: number;
  logged_at: string | null;
};

export type SessionDoc = {
  workout_name: string;
  date: string; // YYYY-MM-DD (local)
  duration_sec: number;
  notes: string;
  started_at: string | null; // ISO-8601 with Z
  finished_at?: string | null; // ISO-8601 with Z; absent on legacy sessions
  created_at: string; // ISO-8601 with Z
  state_json: string | null;
  is_deload: number; // 0 | 1
  sets: SetRow[];
};

export type SessionWithId = SessionDoc & { id: string };

export type MeasurementDoc = {
  taken_at: string; // ISO-8601 with Z
  date: string; // YYYY-MM-DD
  head_cm: number | null;
  neck_cm: number | null;
  shoulder_cm: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  l_arm_cm: number | null;
  r_arm_cm: number | null;
  l_thigh_cm: number | null;
  r_thigh_cm: number | null;
  l_calf_cm: number | null;
  r_calf_cm: number | null;
  weight_kg: number | null;
  notes: string | null;
};

export type Settings = {
  gender?: string;
  birth_date?: string;
  bodyweight?: string;
  [key: string]: string | undefined;
};

// Map of "exercise|set_type|set_number" → last-known values, same shape the
// old /api/last-session and /api/exercise-hints returned.
export type HintValue = {
  weight_lb: number | null;
  reps: string | number | null;
  bands_json: string | null;
  grip: string | null;
};
export type HintMap = Record<string, HintValue>;
