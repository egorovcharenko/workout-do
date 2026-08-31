"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { syncFirebaseAuthFromSuite } from "@personal-suite/suite-auth/firebase-client";
import { auth } from "./client";
import { error as logError, log, warn } from "@/lib/log";

type AuthState = {
  user: User | null;
  loading: boolean;
};

const Ctx = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    log("auth", "AuthProvider mounted — syncing shared suite session");
    const stuckTimer = setTimeout(() => {
      warn("auth", "no auth-state event after 8000ms — Firebase Auth may be stuck");
    }, 8000);

    let syncComplete = false;
    let cancelled = false;
    const unsub = onAuthStateChanged(auth(), (user) => {
      if (syncComplete && !cancelled) setState({ user, loading: false });
    });
    void syncFirebaseAuthFromSuite(auth())
      .then((user) => {
        syncComplete = true;
        clearTimeout(stuckTimer);
        log("auth", user ? "shared session connected" : "shared session absent", {
          uid: user?.uid,
          email: user?.email,
        });
        if (!cancelled) setState({ user, loading: false });
      })
      .catch((e: unknown) => {
        syncComplete = true;
        clearTimeout(stuckTimer);
        logError("auth", "shared session sync failed", e);
        if (!cancelled) setState({ user: null, loading: false });
      });
    return () => {
      cancelled = true;
      clearTimeout(stuckTimer);
      unsub();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
