import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireServiceAuth, ServiceAuthContext } from '../middleware/auth';
import type { Referral } from '../entities/Referral';
import { RECOVERY_PLATFORM_API_KEY } from '../config';

const TARGET_APPS = [
  'treatment-center',
  'phoenix-cleanhouse',
  'homegroups',
  'sober-living',
] as const;

const CreateReferralSchema = z.object({
  toApp: z.enum(TARGET_APPS),
  clientName: z.string().min(1).max(100),
  clientEmail: z.string().email(),
  condition: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export async function handleCreateReferral(
  data: unknown,
  context: ServiceAuthContext,
  db: FirebaseFirestore.Firestore,
): Promise<{ id: string; status: 'pending' }> {
  const parsed = CreateReferralSchema.parse(data);
  const ref = await db.collection('referrals').add({
    ...parsed,
    fromApp: context.appId,
    referredBy: context.uid,
    referredByApp: context.appId,
    status: 'pending',
    createdAt: new Date(),
  });
  return { id: ref.id, status: 'pending' };
}

export async function handleGetReferrals(
  context: ServiceAuthContext,
  db: FirebaseFirestore.Firestore,
): Promise<{ referrals: (Referral & { id: string })[] }> {
  const snap = await db
    .collection('referrals')
    .where('referredBy', '==', context.uid)
    .where('referredByApp', '==', context.appId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  const referrals = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Referral),
  }));
  return { referrals };
}

export async function handleGetReferral(
  data: { id: string },
  context: ServiceAuthContext,
  db: FirebaseFirestore.Firestore,
): Promise<Referral & { id: string }> {
  const doc = await db.collection('referrals').doc(data.id).get();
  if (!doc.exists) throw new HttpsError('not-found', 'Referral not found');
  const referral = doc.data() as Referral;
  if (referral.referredBy !== context.uid || referral.referredByApp !== context.appId) {
    throw new HttpsError('permission-denied', 'Forbidden');
  }
  return { id: doc.id, ...referral };
}

export const createReferral = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (request: CallableRequest) => {
    const context = requireServiceAuth(request);
    return handleCreateReferral(request.data, context, getFirestore());
  },
);

export const getReferrals = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (request: CallableRequest) => {
    const context = requireServiceAuth(request);
    return handleGetReferrals(context, getFirestore());
  },
);

export const getReferral = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (request: CallableRequest) => {
    const context = requireServiceAuth(request);
    return handleGetReferral(request.data, context, getFirestore());
  },
);
