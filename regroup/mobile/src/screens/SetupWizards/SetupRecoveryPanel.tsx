import React, { useCallback, useState } from 'react';
import { navigateToMainTab } from '../../navigation/authNavigation';
import { Routes, SetupScreenNavigationProp } from '../../navigation/types';
import { retrySetupRecovery } from '../../state/slices/setupRecoveryThunk';
import { useAppDispatch } from '../../state/store';
import SetupBlockingPanel from './SetupBlockingPanel';

export const RETRY_FAILED_MESSAGE =
  "We still couldn't finish. Check your connection and try again, or contact support.";

/**
 * Shown by OrgSetup instead of the wizard while userSlice.setupRecoveryFailed
 * is set: the operator's houses may already exist, so re-entering them would
 * hit the plan cap or create duplicates. Retry re-runs finishOperatorSetup.
 */
const SetupRecoveryPanel: React.FC<{ navigation?: SetupScreenNavigationProp }> = ({
  navigation,
}) => {
  const dispatch = useAppDispatch();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retry = useCallback(async () => {
    setRetrying(true);
    setError(null);
    try {
      const { user } = await dispatch(retrySetupRecovery()).unwrap();
      // On `incomplete` the flag is cleared and OrgSetup renders the wizard.
      if (user?.orgSetupCompleted && navigation) {
        navigateToMainTab(navigation, Routes.House);
      }
    } catch {
      // finishOperatorSetup already logged the failure.
      setError(RETRY_FAILED_MESSAGE);
    } finally {
      setRetrying(false);
    }
  }, [dispatch, navigation]);

  return (
    <SetupBlockingPanel
      testID="setup-recovery-panel"
      title="We're finishing setting up your houses"
      body="Your houses may already have been created. We need to finish connecting them to your account before you continue."
      error={error}
      primaryTitle={retrying ? 'Retrying…' : 'Retry'}
      primaryTestID="setup-recovery-retry"
      onPrimary={retry}
      primaryBusy={retrying}
    />
  );
};

export default SetupRecoveryPanel;
