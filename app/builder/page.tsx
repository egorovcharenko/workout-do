"use client";
import dynamic from "next/dynamic";
import AuthGate from "@/components/AuthGate";
import "./builder.css";

const BuilderApp = dynamic(() => import("@/components/builder/BuilderApp"), { ssr: false });

export default function BuilderPage() {
  return (
    <AuthGate>
      <BuilderApp />
    </AuthGate>
  );
}
