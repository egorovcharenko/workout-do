// Legacy-shaped `api` adapter: same method names and response shapes as the
// old fetch('/api/...') object in workout-session-utils.js, backed by
// Firestore. The ported UI keeps calling api.todaySession(...) etc. and
// doesn't know the backend changed.

import { auth } from "@/lib/firebase/client";
import {
  deleteSession,
  fetchAllSessions,
  get1RMHistory,
  getActiveSessions,
  getExerciseHints,
  getHistory,
  getLastSession,
  getTodaySession,
  invalidateSessionCache,
  saveSession,
  type SavePayload,
} from "./sessions";
import {
  deleteMeasurement,
  getSettings,
  listExerciseNotes,
  listMeasurements,
  saveMeasurement,
  saveMeasurementsBulk,
  saveSettings,
  upsertExerciseNote,
} from "./misc";
import type { MeasurementDoc } from "./types";

function uid(): string {
  const u = auth().currentUser;
  if (!u) throw new Error("api called before sign-in resolved");
  return u.uid;
}

export const api = {
  todaySession: (workout: string) => getTodaySession(uid(), workout),
  lastSession: (workout: string) => getLastSession(uid(), workout),
  hints: () => getExerciseHints(uid()),
  history: (limit = 20) => getHistory(uid(), limit),
  allHistory: () => getHistory(uid(), Number.POSITIVE_INFINITY),
  history1RM: () => get1RMHistory(uid()),
  activeSessions: () => getActiveSessions(uid()),
  settings: () => getSettings(uid()),
  saveSettings: (data: Record<string, unknown>) => saveSettings(uid(), data),
  save: (body: SavePayload) => saveSession(uid(), body),
  deleteSession: (id: string) => deleteSession(uid(), String(id)),

  measurements: () => listMeasurements(uid()),
  saveMeasurement: (data: Partial<MeasurementDoc>) => saveMeasurement(uid(), data),
  saveMeasurementsBulk: (entries: Partial<MeasurementDoc>[]) =>
    saveMeasurementsBulk(uid(), entries),
  deleteMeasurement: (id: string) => deleteMeasurement(uid(), String(id)),

  exerciseNotes: () => listExerciseNotes(uid()),
  saveExerciseNote: (exercise: string, body: string) =>
    upsertExerciseNote(uid(), exercise, body),

  // AI motivations were disabled server-side long ago; keep the surface so
  // stale call sites no-op instead of crashing.
  motivate: () => Promise.resolve({ message: null, disabled: true }),
  motivations: () => Promise.resolve({}),

  // Exposed for power-user/debug parity with the old /api/update-set.
  _fetchAllSessions: () => fetchAllSessions(uid()),
  _invalidate: () => invalidateSessionCache(),
};

export type Api = typeof api;
