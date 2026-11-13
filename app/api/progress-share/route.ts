import { getFirebaseAdminFirestore, verifyRequestUid } from '@/lib/firebase/admin';
import { getProgressShare, saveProgressShare, removeProgressShare } from '@/lib/progress-share-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request, method: 'GET' | 'POST' | 'DELETE') {
  if (method !== 'GET' && request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  }
  const uid = await verifyRequestUid(request);
  if (!uid) return Response.json({ error: 'Sign in to share progress.' }, { status: 401 });
  try {
    const db = getFirebaseAdminFirestore();
    const result = method === 'GET' ? await getProgressShare(db, uid)
      : method === 'POST' ? await saveProgressShare(db, uid) : await removeProgressShare(db, uid);
    return Response.json(result || { path: null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[PROGRESS-SHARE]', error);
    return Response.json({ error: 'Could not update sharing. Try again.' }, { status: 500 });
  }
}
export const GET = (request: Request) => handle(request, 'GET');
export const POST = (request: Request) => handle(request, 'POST');
export const DELETE = (request: Request) => handle(request, 'DELETE');
