const PRODUCTION_HOME_URL = "https://suite.egorovcharenko.com";

export function getSuiteHomeUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUITE_HOME_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : PRODUCTION_HOME_URL)
  );
}

export function getSuiteSignInUrl(returnTo?: string): string {
  const url = new URL("/sign-in", getSuiteHomeUrl());
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

export function getSuiteSignOutUrl(returnTo?: string): string {
  const url = new URL("/api/suite-auth/sign-out", getSuiteHomeUrl());
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  return url.toString();
}
