import { signOut as fbSignOut } from "firebase/auth";
import {
  getSuiteSignInUrl,
  getSuiteSignOutUrl,
} from "@personal-suite/suite-auth/client";
import { auth } from "./client";
import { error, log } from "@/lib/log";

export async function signInWithGoogle() {
  log("auth", "signInWithGoogle: redirecting to shared suite sign-in");
  window.location.assign(getSuiteSignInUrl(window.location.href));
}

export async function signOut() {
  log("auth", "signOut: starting…");
  try {
    await fbSignOut(auth());
    log("auth", "signOut: complete");
    window.location.assign(
      getSuiteSignOutUrl(getSuiteSignInUrl(window.location.href)),
    );
  } catch (e) {
    error("auth", "signOut: failed", e);
    throw e;
  }
}
