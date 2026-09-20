import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFirebaseAdminFirestore } from '@personal-suite/suite-auth/firebase-admin';
import { readPublicProgress } from '@/lib/progress-share-store';
import { validProgressToken } from '@/lib/progress-sharing';
import { renderProgressModel } from '@/components/home/progress';
import '../../workout-recap.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'All-time progress',
  description: 'Workout and measurement progress',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function SharedProgress({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validProgressToken(token)) notFound();
  const model = await readPublicProgress(getFirebaseAdminFirestore(), token);
  if (!model) notFound();
  return <main className="shared-progress-page" dangerouslySetInnerHTML={{ __html: renderProgressModel(model) }} />;
}
