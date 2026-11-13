import { auth } from "./client";

/**
 * Authorization header for our own API routes. They verify the Firebase ID
 * token server-side (lib/firebase/admin.ts) — there is no cookie session.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const user = auth().currentUser;
  if (!user) throw new Error("Sign in to continue.");
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}
