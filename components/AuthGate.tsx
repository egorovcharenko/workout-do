"use client";

import { type ReactNode } from "react";
import { useAuth } from "@/lib/firebase/auth";
import { signInWithGoogle } from "@/lib/firebase/auth-actions";

/**
 * Gates a page on Firebase auth. Loading → spinner; signed out → inline
 * sign-in prompt (no separate /login route needed for a single-user app);
 * signed in → children.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B0F14" }}>
        <div className="w-8 h-8 rounded-full border-2 border-gray-700 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={{ background: "#0B0F14" }}>
        <div className="text-2xl font-bold text-gray-100">Workout Do</div>
        <button
          onClick={() => void signInWithGoogle()}
          className="px-5 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
