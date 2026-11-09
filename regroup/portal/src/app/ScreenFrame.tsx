import type { ReactNode } from 'react';
import ErrorBoundary from '@mobile/components/ErrorBoundary';
import { houseIdForState } from './current-house';
import { HouseGate } from './HouseGate';
import { SubscriptionCheck } from './SubscriptionCheck';
import { useRoleUnknown } from './useHouseAccess';

// Wraps the focused screen inside the navigator. Gates above the navigator would
// unmount it while a house loads, which resets navigation to its first route.
// Keying the boundary on the route means leaving a crashed screen clears the crash.
export function ScreenFrame({ state, routeKey, children }: { state: any; routeKey: string; children: ReactNode }) {
  const houseId = houseIdForState(state);
  const screen = <ErrorBoundary key={routeKey}>{children}</ErrorBoundary>;
  const framed =
    houseId === null ? (
      screen
    ) : (
      <HouseGate houseId={houseId}>
        <SubscriptionCheck>{screen}</SubscriptionCheck>
      </HouseGate>
    );
  return (
    <>
      <RoleNotice />
      {framed}
    </>
  );
}

// Plain text rather than role="status": tests count status elements for the totals.
function RoleNotice() {
  if (!useRoleUnknown()) return null;
  return (
    <p data-testid="role-notice" style={{ margin: 0, padding: '8px 16px', background: '#fff4d6', font: '14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      Couldn't confirm your role, so some details are hidden.
    </p>
  );
}
