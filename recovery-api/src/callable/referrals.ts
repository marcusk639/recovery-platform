import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireServiceAuth, ServiceAuthContext } from '../middleware/auth';
import type { Referral } from '../entities/Referral';
import { RECOVERY_PLATFORM_API_KEY } from '../config';
import { resolveAppId, isTargetAppId } from '../config/apps';

// `toApp` accepts a display name, alias, or canonical app-id on the wire; it is
// resolved to the canonical app-id (and validated as a target) before storage.
const CreateReferralSchema = z.object({
  toApp: z.string().min(1).max(64),
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
  let parsed: z.infer<typeof CreateReferralSchema>;
  try {
    parsed = CreateReferralSchema.parse(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      // Log issue paths/codes only — never the raw payload (clientName/email are PII).
      logger.warn('createReferral: invalid payload', { issues: err.issues });
      throw new HttpsError('invalid-argument', 'Invalid referral payload');
    }
    throw err;
  }

  const toApp = resolveAppId(parsed.toApp);
  if (!toApp || !isTargetAppId(toApp)) {
    throw new HttpsError('invalid-argument', `Unknown referral target: ${parsed.toApp}`);
  }

  // Drop the raw wire `toApp` so the spread can't re-store the unnormalized value;
  // the canonical `toApp` below is the only one persisted.
  const { toApp: _rawToApp, ...rest } = parsed;
  try {
    const ref = await db.collection('referrals').add({
      ...rest,
      toApp,
      fromApp: context.appId,
      referredBy: context.uid,
      referredByApp: context.appId,
      status: 'pending',
      createdAt: new Date(),
    });
    return { id: ref.id, status: 'pending' };
  } catch (err) {
    logger.error('createReferral: persistence failed', err);
    throw new HttpsError('internal', 'Failed to create referral');
  }
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
