import {
  signInWithCustomToken,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

export class SuiteFirebaseSyncError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SuiteFirebaseSyncError";
  }
}

export async function syncFirebaseAuthFromSuite(auth: Auth): Promise<User | null> {
  const response = await fetch("/api/suite-auth/firebase-token", {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (response.status === 401 || response.status === 403) {
    if (auth.currentUser) await signOut(auth);
    return null;
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new SuiteFirebaseSyncError(
      payload?.error || "Could not connect this app to the shared session.",
      response.status,
    );
  }

  const { token } = (await response.json()) as { token: string };
  const credential = await signInWithCustomToken(auth, token);
  return credential.user;
}
