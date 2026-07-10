"use client";

import dynamic from "next/dynamic";
import AuthGate from "@/components/AuthGate";
import "../../session/session.css";

const SessionApp = dynamic(() => import("@/components/session/SessionApp"), { ssr: false });

export default function SessionV2Page() {
  return (
    <AuthGate>
      <SessionApp cardVariant="v2" homeHref="/v2" />
    </AuthGate>
  );
}
