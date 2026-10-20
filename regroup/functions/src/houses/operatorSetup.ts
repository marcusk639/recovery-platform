import { userCollection } from '../api/firestore';

/**
 * Fields that move the operator past onboarding. Written only after the claims
 * are granted, so a failed grant never leaves an operator who skips setup but
 * holds no house claims; a retry writes them once the grant succeeds.
 */
export const OPERATOR_SETUP_FIELDS = {
  orgSetupCompleted: true,
  isAdmin: true,
  isSuperAdmin: true,
} as const;

/**
 * Sets the onboarding flags on the operator's user doc. Call only after
 * grantHouseRoles has succeeded for the operator's houses. Idempotent.
 */
export const writeOperatorSetupFlags = async (uid: string): Promise<void> => {
  await userCollection.doc(uid).update({ ...OPERATOR_SETUP_FIELDS });
};
