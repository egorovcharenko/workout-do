import { auth } from "@/auth";
import {
  findFirebaseBridgeUid,
  getFirebaseAdminFirestore,
} from "@personal-suite/suite-auth/firebase-admin";
import { isAllowedSuiteEmail } from "@personal-suite/suite-auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const email = session?.user?.email;
  if (!isAllowedSuiteEmail(email)) {
    return Response.json({ error: "Shared sign-in required." }, { status: 401 });
  }

  const id = (await context.params).id.trim();
  if (!id || id.includes("/")) {
    return Response.json({ error: "Invalid workout session id." }, { status: 400 });
  }

  const uid = await findFirebaseBridgeUid(email!);
  if (!uid) {
    return Response.json({ error: "Workout account not found." }, { status: 404 });
  }

  await getFirebaseAdminFirestore()
    .collection("users")
    .doc(uid)
    .collection("sessions")
    .doc(id)
    .delete();

  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
