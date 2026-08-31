import type { MetadataRoute } from "next";
import { createPwaManifest } from "@personal-suite/pwa";

export default function manifest(): MetadataRoute.Manifest {
  return createPwaManifest({
    name: "Workouts",
    shortName: "Workouts",
    description: "Plan, run, and review strength sessions.",
    backgroundColor: "#18191c",
    themeColor: "#f97316",
  });
}
