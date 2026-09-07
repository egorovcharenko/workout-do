"use client";
import dynamic from "next/dynamic";
import AuthGate from "@/components/AuthGate";
import "./session.css";
import "../workout-recap.css";

const SessionApp = dynamic(() => import("@/components/session/SessionApp"), { ssr: false });

export default function SessionPage() {
  return (
    <AuthGate>
      <SessionApp />
    </AuthGate>
  );
}
