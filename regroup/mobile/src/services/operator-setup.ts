// Recovery for operators whose houses were created but whose setup never
// finished (the claim grant or onboarding-flags write failed and the app
// restarted before a retry). Without this, login routes them to an empty setup
// wizard, where re-entering a house mints a new id and hits the plan's
// property cap. See the finishOperatorSetup callable in regroup/functions.
import { functions } from '../../firebase-setup';
import { User } from '../entities/User';
import { logException } from '../util/logging';

export type FinishOperatorSetupResult =
  { completed: false } | { completed: true; houseIds: string[] };

/** Setup is incomplete but the user doc already records owned houses. */
export const needsSetupRecovery = (user: Partial<User> | null | undefined): boolean => {
  if (!user || user.isAnonymous || user.orgSetupCompleted) {
    return false;
  }
  const owned = user.housesOwned?.length ?? 0;
  const inPlan = Object.keys(user.subscriptionMetadata?.houses ?? {}).length;
  return owned > 0 || inPlan > 0;
};

/**
 * Asks the server to finish setup for the houses the caller owns. Returns true
 * only when the server completed it (the caller must then refresh the ID token
 * and reload the user). Never throws: on any failure login falls through to
 * the normal routing (the setup wizard).
 */
export const finishOperatorSetupIfNeeded = async (
  user: Partial<User> | null | undefined,
): Promise<boolean> => {
  if (!needsSetupRecovery(user)) {
    return false;
  }
  try {
    const result = await functions.httpsCallable('finishOperatorSetup')();
    return (result?.data as FinishOperatorSetupResult | undefined)?.completed === true;
  } catch (error) {
    logException(error, 'finishOperatorSetup failed; routing to setup wizard');
    return false;
  }
};
