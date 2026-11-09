import type { ReactNode } from 'react';
import ErrorBoundary from '@mobile/components/ErrorBoundary';
import { houseIdForState } from './current-house';
import { HouseGate } from './HouseGate';
import { SubscriptionCheck } from './SubscriptionCheck';

// Wraps the focused screen inside the navigator. Gates above the navigator would
// unmount it while a house loads, which resets navigation to its first route.
// Keying the boundary on the route means leaving a crashed screen clears the crash.
export function ScreenFrame({ state, routeKey, children }: { state: any; routeKey: string; children: ReactNode }) {
  const houseId = houseIdForState(state);
  const screen = <ErrorBoundary key={routeKey}>{children}</ErrorBoundary>;
  if (houseId === null) return screen;
  return (
    <HouseGate houseId={houseId}>
      <SubscriptionCheck>{screen}</SubscriptionCheck>
    </HouseGate>
  );
}
