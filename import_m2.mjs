import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

const sa = JSON.parse(readFileSync("/Users/egorovcharenko/sports-modern/.serviceAccount.json", "utf8"));
initializeApp({ credential: cert(sa), projectId: "workout-do-egor" });
const db = getFirestore();

// List users collection to find the UID
const users = await db.collection("users").listDocuments();
for (const u of users) {
  console.log("User doc: " + u.id);
}
