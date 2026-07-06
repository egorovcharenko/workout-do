import {
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
} from "firebase/auth";
import { auth, googleProvider } from "./client";
import { error, log } from "@/lib/log";

/**
 * Production uses redirect-based sign-in (popups break on iOS Safari), which
 * works there because next.config.ts proxies /__/auth under our own domain —
 * the flow stays first-party. On localhost the authDomain is the remote
 * *.firebaseapp.com, and Chrome's third-party-storage blocking makes the
 * redirect result silently vanish (getRedirectResult → null, login screen
 * again). Popup keeps the opener window around, so it survives that — use it
 * for local dev only.
 */
export async function signInWithGoogle() {
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname.startsWith("127."));
  try {
    if (isLocal) {
      log("auth", "signInWithGoogle: popup (localhost)…");
      await signInWithPopup(auth(), googleProvider);
    } else {
      log("auth", "signInWithGoogle: starting redirect…");
      await signInWithRedirect(auth(), googleProvider);
    }
  } catch (e) {
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
