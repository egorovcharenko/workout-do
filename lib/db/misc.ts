import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as qLimit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { MeasurementDoc, Settings } from "./types";

// ---------------- settings ----------------
// Single doc users/{uid}/settings/app holding {gender, birth_date, bodyweight}.

const SETTINGS_DEFAULTS: Settings = {
  gender: "male",
  birth_date: "1983-11-08",
  bodyweight: "175",
};

function settingsRef(uid: string) {
  return doc(db(), "users", uid, "settings", "app");
}

export async function getSettings(uid: string): Promise<Settings> {
  const snap = await getDoc(settingsRef(uid));
  return { ...SETTINGS_DEFAULTS, ...(snap.exists() ? (snap.data() as Settings) : {}) };
}

export async function saveSettings(uid: string, data: Record<string, unknown>) {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) clean[k] = String(v);
  await setDoc(settingsRef(uid), clean, { merge: true });
}

// ---------------- exercise notes ----------------
// Doc id = encoded exercise name ('/' is illegal in Firestore ids).

function encodeExercise(name: string): string {
  return encodeURIComponent(name);
}

function notesCol(uid: string) {
  return collection(db(), "users", uid, "exerciseNotes");
}

/** Returns {exercise: body} like the old /api/exercise-notes. */
export async function listExerciseNotes(uid: string): Promise<Record<string, string>> {
  const snap = await getDocs(notesCol(uid));
  const out: Record<string, string> = {};
  for (const d of snap.docs) {
    const data = d.data() as { exercise: string; body: string };
    out[data.exercise] = data.body;
  }
  return out;
}

export async function upsertExerciseNote(uid: string, exercise: string, body: string) {
  const ref = doc(notesCol(uid), encodeExercise(exercise));
  if (!body || !body.trim()) {
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, { exercise, body, updated_at: new Date().toISOString() });
}

// ---------------- measurements ----------------

function measurementsCol(uid: string) {
  return collection(db(), "users", uid, "measurements");
}

export const MEASUREMENT_FIELDS = [
  "head_cm", "neck_cm", "shoulder_cm", "chest_cm", "waist_cm", "hip_cm",
  "l_arm_cm", "r_arm_cm", "l_thigh_cm", "r_thigh_cm", "l_calf_cm", "r_calf_cm",
  "weight_kg",
] as const;

export async function listMeasurements(
  uid: string,
  limit = 500,
): Promise<(MeasurementDoc & { id: string })[]> {
  const snap = await getDocs(
    query(measurementsCol(uid), orderBy("taken_at", "desc"), qLimit(limit)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as MeasurementDoc) }));
}

export async function saveMeasurement(
  uid: string,
  data: Partial<MeasurementDoc>,
): Promise<{ id: string; ok: true }> {
  const taken_at = data.taken_at || new Date().toISOString();
  const docData: MeasurementDoc = {
    taken_at,
    date: data.date || taken_at.slice(0, 10),
    head_cm: null, neck_cm: null, shoulder_cm: null, chest_cm: null,
    waist_cm: null, hip_cm: null, l_arm_cm: null, r_arm_cm: null,
    l_thigh_cm: null, r_thigh_cm: null, l_calf_cm: null, r_calf_cm: null,
    weight_kg: null,
    notes: data.notes ?? null,
  };
  for (const f of MEASUREMENT_FIELDS) {
    if (data[f] != null) docData[f] = Number(data[f]);
  }
  const ref = doc(measurementsCol(uid));
  await setDoc(ref, docData);
  return { id: ref.id, ok: true };
}

export async function saveMeasurementsBulk(
  uid: string,
  entries: Partial<MeasurementDoc>[],
): Promise<{ ids: string[]; count: number }> {
  const ids: string[] = [];
  for (const e of entries) {
    const { id } = await saveMeasurement(uid, e);
    ids.push(id);
  }
  return { ids, count: ids.length };
}

export async function deleteMeasurement(uid: string, id: string) {
  await deleteDoc(doc(measurementsCol(uid), String(id)));
}
