import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Workout Do · Home V2",
  description: "A focused training dashboard for Workout Do.",
};

export default function HomeV2Layout({ children }: { children: ReactNode }) {
  return children;
}
