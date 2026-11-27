import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { appConfigKeys, useMinimumVersion } from '../../state/queries/appConfigQueries';
import { APP_VERSION } from '../../config/appVersion';
import { isUpdateRequired } from './compareVersions';
import UpdateRequiredScreen from './UpdateRequiredScreen';

interface Props {
  children: React.ReactNode;
}

/**
 * The minimum-version gate (launch spec §4.2). Above the navigator, so it runs
 * before sign-in: getAppConfig needs no auth.
 *
 * It fails open. The app renders while the value loads, and a failed or slow
 * (over 3 s) call, a missing or malformed value, or a value for the other
 * platform all let the user in. Only a minimum strictly above this build's
 * version shows UpdateRequiredScreen.
 *
 * Fetched once per launch, and again when the app returns to the foreground
 * (as SubscriptionGate refreshes the paywall), so lowering the value lets a
 * blocked user straight back in.
 */
const VersionGate: React.FC<Props> = ({ children }) => {
  const queryClient = useQueryClient();
  const appState = useRef<typeof AppState.currentState>(AppState.currentState);
  const minVersion = useMinimumVersion();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground = appState.current === 'background' || appState.current === 'inactive';
      if (wasBackground && nextState === 'active') {
        queryClient.invalidateQueries({ queryKey: appConfigKeys.minVersion(Platform.OS) });
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [queryClient]);

  const current = (APP_VERSION as Record<string, string>)[Platform.OS];
  if (isUpdateRequired(current, minVersion)) {
    return <UpdateRequiredScreen />;
  }
  return <>{children}</>;
};

export default VersionGate;
