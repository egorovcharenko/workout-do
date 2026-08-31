import "server-only";

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export class FirebaseBridgeConfigurationError extends Error {
  constructor(readonly missingVariables: readonly string[]) {
    super(`Firebase bridge configuration is missing: ${missingVariables.join(", ")}.`);
    this.name = "FirebaseBridgeConfigurationError";
  }
}

function environment() {
  return {
    projectId:
      process.env.FIREBASE_ADMIN_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
}

function adminApp() {
  const env = environment();
  const missing = [
    ["FIREBASE_ADMIN_PROJECT_ID", env.projectId],
    ["FIREBASE_ADMIN_CLIENT_EMAIL", env.clientEmail],
    ["FIREBASE_ADMIN_PRIVATE_KEY", env.privateKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name as string);

  if (missing.length > 0) throw new FirebaseBridgeConfigurationError(missing);

  const appName = `personal-suite-${env.projectId}`;
  return getApps().some((candidate) => candidate.name === appName)
    ? getApp(appName)
    : initializeApp(
        {
          credential: cert({
            projectId: env.projectId,
            clientEmail: env.clientEmail,
            privateKey: env.privateKey,
          }),
          projectId: env.projectId,
        },
        appName,
      );
}

function adminAuth() {
  return getAuth(adminApp());
}

/** Server-only access to the suite's existing Firebase data store. */
export function getFirebaseAdminFirestore() {
  return getFirestore(adminApp());
}

/** Resolve the Firebase identity paired with an authenticated suite email. */
export async function findFirebaseBridgeUid(email: string): Promise<string | null> {
  try {
    const user = await adminAuth().getUserByEmail(email.trim().toLowerCase());
    return user.uid;
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") return null;
    throw error;
  }
}

export async function createFirebaseBridgeToken(input: {
  email: string;
  displayName?: string | null;
}): Promise<string> {
  const auth = adminAuth();
  const email = input.email.trim().toLowerCase();
  let user;

  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    user = await auth.createUser({
      email,
      emailVerified: true,
      ...(input.displayName ? { displayName: input.displayName } : {}),
    });
  }

  return auth.createCustomToken(user.uid, {
    personal_suite: true,
  });
}
