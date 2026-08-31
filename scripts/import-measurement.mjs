// Insert one body-measurement doc into users/{uid}/measurements.
//
// Mirrors saveMeasurement() in lib/db/misc.ts: same field set, same
// null-defaults, same "only finite numbers reach Firestore" guard, and a
// random doc id from the collection (no natural key). The web app writes
// with the Firebase *client* SDK under the signed-in user; this script uses
// firebase-admin, so it needs a service-account credential.
//
// Credentials (either one):
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//   or FIREBASE_ADMIN_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY
// UID: WORKOUTS_UID, or resolved from WORKOUTS_EMAIL via the Auth admin API.
//
//   node scripts/import-measurement.mjs [--dry-run]

import { readFileSync } from "node:fs";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Fitdays+ export, 2026-08-30 22:09 local (America/Los_Angeles, UTC-7).
// The offset is written out rather than derived from the runner's clock so
// the stamp is identical wherever this runs.
const ENTRY = {
  taken_at: new Date("2026-08-30T22:09:00-07:00").toISOString(),
  date: "2026-08-30",
  head_cm: 61.1,
  neck_cm: 37.4,
  shoulder_cm: 115.7,
  chest_cm: 97.2,
  waist_cm: 87.9,
  hip_cm: 96.3,
  l_arm_cm: 29.5,
  r_arm_cm: 30.0,
  l_thigh_cm: 54.5,
  r_thigh_cm: 54.6,
  l_calf_cm: 37.6,
  r_calf_cm: 37.8,
  // No weight on this reading, and MeasurementDoc has no waist-to-hip field
  // (it is derivable from waist_cm/hip_cm), so the reported 0.9 goes in notes.
  notes: "Fitdays+ import; waist-to-hip ratio 0.9",
};

const MEASUREMENT_FIELDS = [
  "head_cm", "neck_cm", "shoulder_cm", "chest_cm", "waist_cm", "hip_cm",
  "l_arm_cm", "r_arm_cm", "l_thigh_cm", "r_thigh_cm", "l_calf_cm", "r_calf_cm",
  "weight_kg",
];

function buildDoc(data) {
  const taken_at = data.taken_at || new Date().toISOString();
  const doc = {
    taken_at,
    date: data.date || taken_at.slice(0, 10),
    head_cm: null, neck_cm: null, shoulder_cm: null, chest_cm: null,
    waist_cm: null, hip_cm: null, l_arm_cm: null, r_arm_cm: null,
    l_thigh_cm: null, r_thigh_cm: null, l_calf_cm: null, r_calf_cm: null,
    weight_kg: null,
    notes: data.notes ?? null,
  };
  for (const f of MEASUREMENT_FIELDS) {
    const n = Number(data[f]);
    if (data[f] != null && data[f] !== "" && Number.isFinite(n)) doc[f] = n;
  }
  return doc;
}

function credential() {
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (saPath) return cert(JSON.parse(readFileSync(saPath, "utf8")));
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) return cert({ projectId, clientEmail, privateKey });
  return applicationDefault();
}

async function resolveUid() {
  if (process.env.WORKOUTS_UID) return process.env.WORKOUTS_UID;
  const email = process.env.WORKOUTS_EMAIL || process.env.AUTH_ALLOWED_EMAIL;
  if (!email) {
    throw new Error("Set WORKOUTS_UID, or WORKOUTS_EMAIL to look the uid up by email.");
  }
  const user = await getAuth().getUserByEmail(email.trim().toLowerCase());
  return user.uid;
}

const dryRun = process.argv.includes("--dry-run");
const docData = buildDoc(ENTRY);

if (dryRun) {
  console.log(JSON.stringify(docData, null, 2));
  process.exit(0);
}

initializeApp({ credential: credential() });
const uid = await resolveUid();
const col = getFirestore().collection("users").doc(uid).collection("measurements");

// Same-day guard: this import is idempotent-by-hand, not by key, so refuse to
// stack a second doc on a date that already has one.
const clash = await col.where("date", "==", docData.date).limit(1).get();
if (!clash.empty) {
  console.error(
    `A measurement already exists for ${docData.date} (doc ${clash.docs[0].id}). ` +
      `Delete it first if you meant to replace it.`,
  );
  process.exit(1);
}

const ref = col.doc();
await ref.set(docData);
console.log(`Wrote users/${uid}/measurements/${ref.id} for ${docData.date}`);
