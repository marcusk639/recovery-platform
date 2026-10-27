import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import { ratsFirestore } from '../api/firestore';
import type Admin from '../entities/Admin';
import type OperatorSubscription from '../entities/OperatorSubscription';
import { createHousesTx } from '../houses/createHousesTx';
import { createHouseInputSchema } from '../houses/houseInput';
import { writeOperatorSetupFlags } from '../houses/operatorSetup';
import { grantHouseRoles } from '../util/claims';
import { recordOwnerRoles } from '../util/houseRoles';
import { parseInput } from '../validation';

const createHousesSchema = z.object({
  houses: z
    .array(createHouseInputSchema)
    .min(1)
    .max(10)
    .refine((houses) => new Set(houses.map((h) => h.requestKey)).size === houses.length, {
      message: 'House requestKeys must be unique',
    }),
});

export interface CreateHousesResponse {
  houseIds: string[];
  /** requestKey → server-derived house id. */
  idMap: Record<string, string>;
  admin: Admin;
  subscriptionMetadata: OperatorSubscription;
}

export { OPERATOR_SETUP_FIELDS } from '../houses/operatorSetup';

/**
 * Creates an operator's houses server-side. The houses, the operator's admin
 * doc and the user/subscription fields are written in one Firestore
 * transaction; the house-scoped admin + superAdmin claims are granted after it
 * commits, then the onboarding flags (OPERATOR_SETUP_FIELDS) are set. Clients
 * cannot create houses: the Firestore rules deny every client house create.
 *
 * House ids are derived by the server from (uid, requestKey); the client never
 * chooses one and maps its requestKeys to the created ids via `idMap`. Safe to
 * retry with the same requestKeys: they derive the same ids, houses this
 * operator already owns are not rewritten, and the claims are granted again.
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
    await recordOwnerRoles(uid, result.houseIds, 'createHouses');
  } catch (err) {
    logger.error('createHouses: claim grant failed', {
      uid,
      houseIds: result.houseIds,
      code: (err as { code?: string })?.code,
      err,
    });
    throw new HttpsError(
      'internal',
      'Houses were created but access could not be granted. Try again.',
    );
  }

  try {
    await writeOperatorSetupFlags(uid);
  } catch (err) {
    logger.error('createHouses: onboarding flags update failed', {
      uid,
      houseIds: result.houseIds,
      code: (err as { code?: string })?.code,
      err,
    });
    throw new HttpsError('internal', 'Houses were created but setup could not finish. Try again.');
  }

  logger.info('house.created', { uid, houseIds: result.houseIds, status: result.status });

  return {
    houseIds: result.houseIds,
    idMap: result.idMap,
    admin: result.admin as Admin,
    subscriptionMetadata: result.subscriptionMetadata,
  };
});
