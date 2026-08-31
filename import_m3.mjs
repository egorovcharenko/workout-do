import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.GCLOUD_PROJECT = "workout-do-egor";
initializeApp({ credential: applicationDefault(), projectId: "workout-do-egor" });
const db = getFirestore();

const users = await db.collection("users").listDocuments();
for (const u of users.slice(0, 5)) {
  console.log("User: " + u.id);
}
