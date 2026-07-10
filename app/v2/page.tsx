"use client";

import AuthGate from "@/components/AuthGate";
import HomeV2 from "@/components/home-v2/HomeV2";

export default function HomeV2Page() {
  return (
    <AuthGate>
      <HomeV2 />
    </AuthGate>
  );
}
