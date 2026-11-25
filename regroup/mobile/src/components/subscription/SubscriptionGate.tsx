import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAppSelector } from '../../state/store';
import { useSubscriptionGate } from '../../hooks/useSubscriptionGate';
import RatsLoadingIndicator from '../rats-loading-indicator/rats-loading-indicator';
import GracePeriodBanner from './GracePeriodBanner';
import SubscriptionRequiredScreen from '../../screens/Subscription/SubscriptionRequiredScreen';
import GraceExpiredScreen from '../../screens/Subscription/GraceExpiredScreen';
import { refreshPlanState } from '../../services/planState';
import { guestKeys } from '../../state/queries/guestQueries';

interface Props {
  children: React.ReactNode;
}

/**
 * SubscriptionGate wraps the MainNavigator and intercepts navigation for
 * users whose subscription has lapsed. It evaluates the current user's
 * subscription state via useSubscriptionGate() and renders the appropriate
 * UI:
 *
 *   loading              → full-screen loading spinner
 *   allowed              → children (normal app)
 *   grace_period         → children + dismissible top banner
 *   subscription_required → SubscriptionRequiredScreen (operator)
 *   grace_expired        → GraceExpiredScreen (guest)
 *
 * On AppState change from background → active the gate invalidates the
 * user and house React Query caches so stale subscription data is
 * refreshed promptly when the user returns from the billing portal.
 *
 * W13 fix: cache invalidation is guarded behind a currentUser?.id check
 * to avoid triggering during the cold-start race before user data loads.
 */
const SubscriptionGate: React.FC<Props> = ({ children }) => {
  const queryClient = useQueryClient();
  const currentUser = useAppSelector(s => s.user.user);
  const appState = useRef<typeof AppState.currentState>(AppState.currentState);
  const result = useSubscriptionGate();

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        const wasBackground =
          appState.current === 'background' || appState.current === 'inactive';
        const isActive = nextState === 'active';

        if (wasBackground && isActive) {
          // W13: refreshPlanState skips the user and house keys until their
          // ids are loaded, avoiding a cold-start race.
          refreshPlanState(queryClient, { id: currentUser?.id, houseId: currentUser?.houseId as string | undefined });
        }

        appState.current = nextState;
      },
    );

    return () => {
      subscription.remove();
    };
  }, [currentUser?.id, currentUser?.houseId, queryClient]);

  if (result.status === 'loading') {
    return <RatsLoadingIndicator />;
  }

  if (result.status === 'subscription_required') {
    return <SubscriptionRequiredScreen />;
  }

  if (result.status === 'grace_expired') {
    return <GraceExpiredScreen />;
  }

  if (result.status === 'grace_period') {
    return (
      <>
        <GracePeriodBanner endsAt={result.endsAt} />
        {children}
      </>
    );
  }

  // status === 'allowed'
  return <>{children}</>;
};

export default SubscriptionGate;
