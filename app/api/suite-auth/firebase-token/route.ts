import { auth } from "@/auth";
import {
  createFirebaseBridgeToken,
  FirebaseBridgeConfigurationError,
} from "@personal-suite/suite-auth/firebase-admin";
import { isAllowedSuiteEmail } from "@personal-suite/suite-auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!isAllowedSuiteEmail(session?.user?.email)) {
    return Response.json({ error: "Shared sign-in required." }, { status: 401 });
  }

  try {
    const token = await createFirebaseBridgeToken({
      email: session!.user!.email!,
      displayName: session?.user?.name,
    });
    return Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message =
      error instanceof FirebaseBridgeConfigurationError
        ? "The Firebase bridge is not configured."
        : "The Firebase bridge could not create a session.";
    console.error("Workout Firebase bridge failed", error);
    return Response.json({ error: message }, { status: 503 });
  }
}
