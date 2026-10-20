import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import { ratsFirestore } from '../api/firestore';
import type Admin from '../entities/Admin';
import type OperatorSubscription from '../entities/OperatorSubscription';
import { createHousesTx } from '../houses/createHousesTx';
import { createHouseInputSchema } from '../houses/houseInput';
import { grantHouseRoles } from '../util/claims';
import { parseInput } from '../validation';

const createHousesSchema = z.object({
  houses: z
    .array(createHouseInputSchema)
    .min(1)
    .max(10)
    .refine((houses) => new Set(houses.map((h) => h.id)).size === houses.length, {
      message: 'House ids must be unique',
    }),
});

export interface CreateHousesResponse {
  houseIds: string[];
  admin: Admin;
  subscriptionMetadata: OperatorSubscription;
}

/**
 * Creates an operator's houses server-side. The houses, the operator's admin
 * doc and the user/subscription fields are written in one Firestore
 * transaction; the house-scoped admin + superAdmin claims are granted after it
 * commits. The client cannot write a house itself because it does not yet hold
 * the house-scoped claim the Firestore rules require.
 *
 * Safe to retry with the same ids: houses this operator already owns are not
 * rewritten, and the claims are granted again.
 */
export const createHouses = onCall(async (request): Promise<CreateHousesResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login required');
  }
  const uid = request.auth.uid;
  const { houses } = parseInput(createHousesSchema, request.data);
  const now = new Date();

  const result = await ratsFirestore.runTransaction((tx) => createHousesTx(tx, uid, houses, now));

  try {
    await grantHouseRoles(uid, result.houseIds);
  } catch (err) {
    logger.error('createHouses: claim grant failed', {
      uid,
      houseIds: result.houseIds,
      err: (err as Error)?.message,
    });
    throw new HttpsError(
      'internal',
      'Houses were created but access could not be granted. Try again.',
    );
  }

  logger.info('house.created', { uid, houseIds: result.houseIds, status: result.status });

  return {
    houseIds: result.houseIds,
    admin: result.admin as Admin,
    subscriptionMetadata: result.subscriptionMetadata,
  };
});
