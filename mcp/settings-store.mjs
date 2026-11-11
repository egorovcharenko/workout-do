// Where the program lives: users/{uid}/settings/app in Firestore, the same doc
// the app writes. Values are stored as strings (saveSettings in lib/db/misc.ts),
// so program_builder is a JSON string.
//
// Credentials, in order:
//   WORKOUT_SA_PATH or GOOGLE_APPLICATION_CREDENTIALS → a service-account key
//   with Cloud Datastore User on the Firebase project.
// Project id: WORKOUT_PROJECT_ID, else the key's project_id, else .firebaserc.
// User: WORKOUT_UID, else the only doc under users/.
//
// WORKOUT_STORE=file + WORKOUT_SETTINGS_FILE swaps Firestore for a local JSON
// file (used by the tests, and handy for a dry run).
import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function fileStore(file) {
  const read = async () => {
    try { return JSON.parse(await readFile(file, "utf8")); } catch { return {}; }
  };
  return {
    describe: () => `local file ${file}`,
    getSettings: read,
    async saveSettings(patch) {
      const next = { ...(await read()) };
      for (const [key, value] of Object.entries(patch)) next[key] = String(value);
      await writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
    },
  };
}

function projectId(serviceAccount) {
  if (process.env.WORKOUT_PROJECT_ID) return process.env.WORKOUT_PROJECT_ID;
  if (serviceAccount?.project_id) return serviceAccount.project_id;
  try {
    const rc = JSON.parse(readFileSync(path.join(ROOT, ".firebaserc"), "utf8"));
    const id = rc?.projects?.default;
    if (id) return id;
  } catch { /* fall through to the error below */ }
  throw new Error("No Firebase project id. Set WORKOUT_PROJECT_ID.");
}

const NO_CREDENTIALS = [
  "Firestore refused the credentials.",
  "Either point WORKOUT_SA_PATH at a service-account key JSON with Cloud Datastore User on the project (Firebase console → Project settings → Service accounts → Generate new private key),",
  "or give this machine application-default credentials: install the gcloud CLI and run `gcloud auth application-default login`.",
  "WORKOUT_STORE=file with WORKOUT_SETTINGS_FILE is a dry run that needs neither.",
].join(" ");

/** Credential errors surface on the first request, not at startup, so every
 * call explains both ways to fix them instead of leaking a raw gRPC trace. */
async function guard(work) {
  try { return await work(); } catch (error) {
    const message = String(error?.message || error);
    if (/default credentials|PERMISSION_DENIED|UNAUTHENTICATED|invalid_grant/i.test(message)) {
      throw new Error(`${NO_CREDENTIALS} (${message.split("\n")[0]})`);
    }
    throw error;
  }
}

async function firestoreStore() {
  const keyPath = process.env.WORKOUT_SA_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const key = keyPath ? JSON.parse(await readFile(keyPath, "utf8")) : null;
  const { initializeApp, applicationDefault, cert, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const project = projectId(key);
  // No key path: fall back to application-default credentials (gcloud login).
  // Mint a token up front — inside gRPC a missing ADC throws where no caller
  // can catch it and takes the process down with it.
  const credential = key ? cert(key) : applicationDefault();
  if (!key) await guard(() => credential.getAccessToken());
  if (!getApps().length) initializeApp({ credential, projectId: project });
  const db = getFirestore();

  let uid = process.env.WORKOUT_UID || null;
  const resolveUid = async () => {
    if (uid) return uid;
    const docs = await db.collection("users").listDocuments();
    if (docs.length === 1) { uid = docs[0].id; return uid; }
    if (!docs.length) throw new Error(`No user docs under users/ in ${project}. Set WORKOUT_UID.`);
    throw new Error(`Several users in ${project} (${docs.map(d => d.id).join(", ")}). Set WORKOUT_UID.`);
  };
  const ref = async () => db.doc(`users/${await resolveUid()}/settings/app`);

  return {
    describe: () => `Firestore ${project} (${keyPath ? "service account" : "application-default credentials"}), user ${uid || "(auto)"}`,
    getSettings: () => guard(async () => {
      const snap = await (await ref()).get();
      return snap.exists ? snap.data() : {};
    }),
    saveSettings: (patch) => guard(async () => {
      const clean = Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, String(value)]));
      await (await ref()).set(clean, { merge: true });
    }),
  };
}

let cached = null;
export async function store() {
  if (cached) return cached;
  cached = process.env.WORKOUT_STORE === "file"
    ? fileStore(process.env.WORKOUT_SETTINGS_FILE || path.join(ROOT, ".program-settings.json"))
    : await firestoreStore();
  return cached;
}
