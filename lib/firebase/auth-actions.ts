import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
} from "firebase/auth";
import { auth } from "./client";
import { error, log, warn } from "@/lib/log";

/** Popup failures that mean "the browser wouldn't let the popup run". */
const REDIRECT_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
  "auth/cancelled-popup-request",
  "auth/web-storage-unsupported",
]);

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  log("auth", "signInWithGoogle: opening popup");
  try {
    const credential = await signInWithPopup(auth(), provider);
    log("auth", "signInWithGoogle: signed in", {
      uid: credential.user.uid,
      email: credential.user.email,
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "auth/popup-closed-by-user") {
      log("auth", "signInWithGoogle: popup closed by user");
      return;
    }
    if (REDIRECT_FALLBACK_CODES.has(code || "")) {
      warn("auth", "signInWithGoogle: popup unavailable — falling back to redirect", code);
      await signInWithRedirect(auth(), provider);
      return;
    }
    error("auth", "signInWithGoogle: failed", e);
    throw e;
  }
}

export async function signOut() {
  log("auth", "signOut: starting…");
  try {
    await fbSignOut(auth());
    log("auth", "signOut: complete");
  } catch (e) {
    error("auth", "signOut: failed", e);
    throw e;
  }
}
