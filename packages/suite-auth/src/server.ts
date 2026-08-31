import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedSuiteReturnTo } from "./index";

export const SUITE_SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Secure-personal-suite.session-token"
    : "personal-suite.session-token";

function allowedEmails(): Set<string> {
  const configured =
    process.env.AUTH_ALLOWED_EMAIL || process.env.APP_ALLOWED_EMAILS || "";
  return new Set(
    configured
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedSuiteEmail(email?: string | null): boolean {
  if (!email) return false;
  return allowedEmails().has(email.trim().toLowerCase());
}

export function isSuiteAuthConfigured(options?: {
  requireGoogleProvider?: boolean;
}): boolean {
  const baseConfigured = Boolean(
    process.env.AUTH_SECRET && allowedEmails().size > 0,
  );
  if (!options?.requireGoogleProvider) return baseConfigured;
  return Boolean(
    baseConfigured &&
      process.env.AUTH_GOOGLE_ID &&
      process.env.AUTH_GOOGLE_SECRET,
  );
}

type AuthorizedCallback = NonNullable<
  NonNullable<NextAuthConfig["callbacks"]>["authorized"]
>;

export function createSuiteAuth(options?: {
  authorized?: AuthorizedCallback;
}) {
  const production = process.env.NODE_ENV === "production";
  const cookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();

  return NextAuth({
    providers: [Google],
    secret: process.env.AUTH_SECRET,
    trustHost: true,
    session: {
      strategy: "jwt",
      maxAge: 30 * 24 * 60 * 60,
    },
    cookies: {
      sessionToken: {
        name: SUITE_SESSION_COOKIE,
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: production,
          ...(production && cookieDomain ? { domain: cookieDomain } : {}),
        },
      },
    },
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== "google") return false;
        const googleProfile = profile as
          | { email?: string; email_verified?: boolean }
          | undefined;
        return Boolean(
          googleProfile?.email_verified &&
            isAllowedSuiteEmail(googleProfile.email),
        );
      },
      async redirect({ url, baseUrl }) {
        if (url.startsWith("/")) return `${baseUrl}${url}`;
        if (isAllowedSuiteReturnTo(url)) return url;
        return baseUrl;
      },
      ...(options?.authorized ? { authorized: options.authorized } : {}),
    },
  });
}
