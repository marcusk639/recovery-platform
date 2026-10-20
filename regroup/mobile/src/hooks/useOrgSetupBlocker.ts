import { useCallback, useEffect, useState } from 'react';
import { canCreateHouses } from '../services/setup-plan-gate';
import { getUser } from '../services/users';
import { resetSubmissionState } from '../state/slices/setupSlice';
import { useAppDispatch, useAppSelector } from '../state/store';
import { logException } from '../util/logging';

export type OrgSetupBlocker = 'setup-recovery' | 'plan-required' | null;

/**
 * What OrgSetup must show instead of the wizard:
 * - setup-recovery: finishOperatorSetup failed on login; the houses may exist.
 * - plan-required: a fresh read of the user doc fails the createHouses
 *   entitlement gate (checked at entry), or createHouses refused for no active
 *   plan (backstop). A failed read does not block: the server still enforces
 *   the gate.
 * `checkAgain` clears the submission error and re-reads the plan.
 */
export const useOrgSetupBlocker = (): {
  kind: OrgSetupBlocker;
  checkAgain: () => Promise<void>;
} => {
  const dispatch = useAppDispatch();
  const recoveryFailed = useAppSelector((s) => s.user.setupRecoveryFailed);
  const refusedForPlan = useAppSelector((s) => s.setup.errorKind === 'subscription-required');
  const uid = useAppSelector((s) => s.user.user?.id);
  const [planRequired, setPlanRequired] = useState(false);

  const checkPlan = useCallback(async () => {
    if (!uid || recoveryFailed) {
      return;
    }
    try {
      const fresh = await getUser(uid);
      setPlanRequired(!canCreateHouses(fresh?.subscriptionMetadata));
    } catch (error) {
      logException(error, 'OrgSetup: plan check failed; not blocking');
      setPlanRequired(false);
    }
  }, [uid, recoveryFailed]);

  useEffect(() => {
    checkPlan();
  }, [checkPlan]);

  const checkAgain = useCallback(async () => {
    dispatch(resetSubmissionState());
    await checkPlan();
  }, [dispatch, checkPlan]);

  if (recoveryFailed) {
    return { kind: 'setup-recovery', checkAgain };
  }
  return { kind: planRequired || refusedForPlan ? 'plan-required' : null, checkAgain };
};
