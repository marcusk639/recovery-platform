import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireServiceAuth, ServiceAuthContext } from '../middleware/auth';
import type { User } from '../entities/User';
import { RECOVERY_PLATFORM_API_KEY } from '../config';

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  sobrietyDate: z.string().date().optional(),
  homeApp: z.string().optional(),
});

export async function handleGetUserProfile(
  context: ServiceAuthContext,
  db: FirebaseFirestore.Firestore,
): Promise<{ profile: User | null }> {
  const docId = `${context.appId}:${context.uid}`;
  const doc = await db.collection('users').doc(docId).get();
  if (!doc.exists) return { profile: null };
  return { profile: doc.data() as User };
}

export async function handleUpdateUserProfile(
  data: unknown,
  context: ServiceAuthContext,
  db: FirebaseFirestore.Firestore,
): Promise<{ updated: true }> {
  const parsed = UpdateProfileSchema.parse(data);
  const docId = `${context.appId}:${context.uid}`;
  await db
    .collection('users')
    .doc(docId)
    .set({ ...parsed, updatedAt: new Date() }, { merge: true });
  return { updated: true };
}

export const getUserProfile = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (request: CallableRequest) => {
    const context = requireServiceAuth(request);
    return handleGetUserProfile(context, getFirestore());
  },
);

export const updateUserProfile = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (request: CallableRequest) => {
    const context = requireServiceAuth(request);
    return handleUpdateUserProfile(request.data, context, getFirestore());
  },
);
