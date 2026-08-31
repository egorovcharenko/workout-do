export {
  getSuiteHomeUrl,
  getSuiteSignInUrl,
  getSuiteSignOutUrl,
} from "./client";

export const SUITE_PRODUCTION_ORIGINS = [
  "https://suite.egorovcharenko.com",
  "https://workouts.egorovcharenko.com",
  "https://blocks.egorovcharenko.com",
  "https://social.egorovcharenko.com",
  "https://westie.egorovcharenko.com",
  "https://grammar.egorovcharenko.com",
  "https://hook.egorovcharenko.com",
] as const;

export function isAllowedSuiteReturnTo(value: string): boolean {
  try {
    const url = new URL(value);
    if (process.env.NODE_ENV === "development") {
      return url.hostname === "localhost" || url.hostname === "127.0.0.1";
    }
    return (SUITE_PRODUCTION_ORIGINS as readonly string[]).includes(url.origin);
  } catch {
    return false;
  }
}
