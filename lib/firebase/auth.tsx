"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, getRedirectResult, type User } from "firebase/auth";
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
    log("auth", "AuthProvider mounted — subscribing to onAuthStateChanged");
    const stuckTimer = setTimeout(() => {
      warn("auth", "no auth-state event after 8000ms — Firebase Auth may be stuck");
    }, 8000);

    getRedirectResult(auth())
      .then((res) => {
        if (res) {
          log("auth", "getRedirectResult: success", {
            uid: res.user.uid,
            email: res.user.email,
          });
        } else {
          log("auth", "getRedirectResult: no pending redirect");
        }
      })
      .catch((e: unknown) => {
        logError("auth", "getRedirectResult: failed", e);
      });
    const unsub = onAuthStateChanged(auth(), (user) => {
      clearTimeout(stuckTimer);
      if (user) {
        log("auth", "state changed: SIGNED IN", {
          uid: user.uid,
          email: user.email,
        });
      } else {
        log("auth", "state changed: SIGNED OUT (user = null)");
      }
      setState({ user, loading: false });
    });
    return () => {
      clearTimeout(stuckTimer);
      unsub();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
