export type SuiteAppId =
  | "home"
  | "workouts"
  | "block-do"
  | "social-ground"
  | "westie-lab"
  | "grammatron"
  | "hook-90"
  | "cleveland-properties"
  // @suite-new-app-id
  ;

export type SuiteApp = {
  id: SuiteAppId;
  name: string;
  shortName: string;
  description: string;
  href: string;
  accent: string;
  installable: boolean;
  offlineCapable: boolean;
};

type AppDefinition = Omit<SuiteApp, "href"> & {
  productionUrl: string;
  localUrl: string;
  overrideUrl?: string;
};

const definitions: AppDefinition[] = [
  {
    id: "home",
    name: "Personal Suite",
    shortName: "Home",
    description: "One launchpad for every personal app.",
    productionUrl: "https://suite.egorovcharenko.com",
    localUrl: "http://localhost:3000",
    overrideUrl: process.env.NEXT_PUBLIC_SUITE_HOME_URL,
    accent: "#f4e7d3",
    installable: true,
    offlineCapable: false,
  },
  {
    id: "workouts",
    name: "Workouts",
    shortName: "Workouts",
    description: "Plan, run, and review strength sessions.",
    productionUrl: "https://workouts.egorovcharenko.com",
    localUrl: "http://localhost:3001",
    overrideUrl: process.env.NEXT_PUBLIC_SUITE_WORKOUTS_URL,
    accent: "#f97316",
    installable: true,
    offlineCapable: true,
  },
  {
    id: "block-do",
    name: "Blocks",
    shortName: "Blocks",
    description: "Plan tasks, projects, habits, and time blocks.",
    productionUrl: "https://blocks.egorovcharenko.com",
    localUrl: "http://localhost:3002",
    overrideUrl: process.env.NEXT_PUBLIC_SUITE_BLOCKS_URL,
    accent: "#6366f1",
    installable: true,
    offlineCapable: true,
  },
  {
    id: "social-ground",
    name: "Social Ground",
    shortName: "Social",
    description: "Practice social cues, boundaries, and communication.",
    productionUrl: "https://social.egorovcharenko.com",
    localUrl: "http://localhost:3003",
    overrideUrl: process.env.NEXT_PUBLIC_SUITE_SOCIAL_URL,
    accent: "#14b8a6",
    installable: true,
    offlineCapable: false,
  },
  {
    id: "westie-lab",
    name: "Westie Lab",
    shortName: "Westie",
    description: "West Coast Swing move tree, styling, and combos.",
    productionUrl: "https://westie.egorovcharenko.com",
    localUrl: "http://localhost:3004",
    overrideUrl: process.env.NEXT_PUBLIC_SUITE_WESTIE_URL,
    accent: "#e7b659",
    installable: true,
    offlineCapable: true,
  },
  {
    id: "grammatron",
    name: "Grammatron",
    shortName: "Grammar",
    description: "Master English grammar with spaced repetition.",
    productionUrl: "https://grammar.egorovcharenko.com",
    localUrl: "http://localhost:3005",
    overrideUrl: process.env.NEXT_PUBLIC_SUITE_GRAMMAR_URL,
    accent: "#8b5cf6",
    installable: true,
    offlineCapable: false,
  },
  {
    id: "hook-90",
    name: "HOOK/90",
    shortName: "HOOK/90",
    description: "Chase a perfect line in a one-touch grappling speed run.",
    productionUrl: "https://hook.egorovcharenko.com",
    localUrl: "http://localhost:3006",
    overrideUrl: process.env.NEXT_PUBLIC_SUITE_HOOK_90_URL,
    accent: "#ff4d8d",
    installable: true,
    offlineCapable: true,
  },
  {
    id: "cleveland-properties",
    name: "Cleveland Investment Properties",
    shortName: "Cleveland In",
    description: "A personal suite app.",
    productionUrl: "https://cleveland-properties.vercel.app",
    localUrl: "http://localhost:3007",
    overrideUrl: process.env.NEXT_PUBLIC_SUITE_CLEVELAND_PROPERTIES_URL,
    accent: "#22c55e",
    installable: true,
    offlineCapable: false,
  },
  // @suite-new-app-definition
];

export function getSuiteApps(): SuiteApp[] {
  const development = process.env.NODE_ENV === "development";

  return definitions.map(({ productionUrl, localUrl, overrideUrl, ...app }) => ({
    ...app,
    href: overrideUrl || (development ? localUrl : productionUrl),
  }));
}

export function getSuiteApp(id: SuiteAppId): SuiteApp {
  const app = getSuiteApps().find((candidate) => candidate.id === id);
  if (!app) throw new Error(`Unknown Personal Suite app: ${id}`);
  return app;
}
