import "server-only";

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export class FirebaseAdminConfigurationError extends Error {
  constructor(readonly missingVariables: readonly string[]) {
    super(`Firebase Admin configuration is missing: ${missingVariables.join(", ")}.`);
    this.name = "FirebaseAdminConfigurationError";
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

  if (missing.length > 0) throw new FirebaseAdminConfigurationError(missing);

  const appName = `workout-do-${env.projectId}`;
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

/** Server-only access to the app's Firestore data store. */
export function getFirebaseAdminFirestore() {
  return getFirestore(adminApp());
}

function allowedEmails(): Set<string> {
  const configured =
    process.env.AUTH_ALLOWED_EMAIL || process.env.APP_ALLOWED_EMAILS || "";
  return new Set(
    configured
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedEmail(email?: string | null): boolean {
  if (!email) return false;
  return allowedEmails().has(email.trim().toLowerCase());
}

/**
 * Verify the `Authorization: Bearer <firebase id token>` header and return the
 * caller's uid, or null when the token is missing, invalid, or belongs to an
 * email outside AUTH_ALLOWED_EMAIL. This is the whole server-side gate: the
 * app signs in directly with Firebase, so the ID token is the only credential.
 */
export async function verifyRequestUid(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer (.+)$/i.exec(header.trim());
  if (!match) return null;
  try {
    const token = await getAuth(adminApp()).verifyIdToken(match[1].trim());
    if (!isAllowedEmail(token.email)) return null;
    return token.uid;
  } catch (error) {
    console.error("[AUTH] ID token verification failed", error);
    return null;
  }
}
