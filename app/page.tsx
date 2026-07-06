"use client";
import dynamic from "next/dynamic";
import AuthGate from "@/components/AuthGate";
import "./home.css";

const HomeApp = dynamic(() => import("@/components/home/HomeApp"), { ssr: false });

export default function Home() {
  return (
    <AuthGate>
      <HomeApp />
    </AuthGate>
  );
}
