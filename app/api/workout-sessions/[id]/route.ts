import { getFirebaseAdminFirestore, verifyRequestUid } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const uid = await verifyRequestUid(request);
  if (!uid) {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }

  const id = (await context.params).id.trim();
  if (!id || id.includes("/")) {
    return Response.json({ error: "Invalid workout session id." }, { status: 400 });
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
