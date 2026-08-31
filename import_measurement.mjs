import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

const sa = JSON.parse(readFileSync("/Users/egorovcharenko/sports-modern/.serviceAccount.json", "utf8"));
initializeApp({ credential: cert(sa), projectId: "workout-do-egor" });
const db = getFirestore();
const auth = getAuth();

const user = await auth.getUserByEmail("egor.ovcharenko@gmail.com");
console.log("UID: " + user.uid);

const data = {
  taken_at: "2026-08-30T22:09:00.000Z",
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
  weight_kg: null,
  notes: "Imported from Fitdays+ via Claude"
};

const ref = await db.collection("users").doc(user.uid).collection("measurements").add(data);
console.log("Saved: " + ref.id);
process.exit(0);
