import type { ReactNode } from 'react';
import ErrorBoundary from '@mobile/components/ErrorBoundary';
import { Breadcrumb } from './Breadcrumb';
import { guestIdForState, houseIdForState } from './current-house';
import { HouseTabs } from './HouseTabs';
import { useConfirmOnRemove, useLeaveWarning } from './leave-guard';
import { ResidentGate } from './residents/ResidentGate';
import { FullViewGate } from './FullViewGate';
import { HouseGate } from './HouseGate';
import { SubscriptionCheck } from './SubscriptionCheck';
import { useRoleUnknown } from './useHouseAccess';

// Wraps the focused screen inside the navigator. Gates above the navigator would
// unmount it while a house loads, which resets navigation to its first route.
// Keying the boundary on the route means leaving a crashed screen clears the crash.
const column = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } as const;

export function ScreenFrame(props: { state: any; routeKey: string; navigation?: any; children: ReactNode }) {
  const { state, routeKey, children } = props;
  const houseId = houseIdForState(state);
  const guestId = guestIdForState(state);
  const routeName: string = state.routes[state.index]?.name ?? '';
  useLeaveWarning(routeName);
  useConfirmOnRemove(props.navigation, routeName);
  const boundary = <ErrorBoundary key={routeKey}>{children}</ErrorBoundary>;
  const screen = (
    <div data-testid="screen-body" style={column}>
      {/* The role gate always applies in a house. A guestId in the URL's query
          used to choose the resident branch instead, which skipped it. */}
      {houseId ? (
        <FullViewGate houseId={houseId} routeName={routeName}>
          {guestId ? (
            <ResidentGate houseId={houseId} guestId={guestId}>
              {boundary}
            </ResidentGate>
          ) : (
            boundary
          )}
        </FullViewGate>
      ) : (
        boundary
      )}
    </div>
  );
  // Breadcrumb and tabs sit outside the screen's boundary, so a crash can be left.
  const framed =
    houseId === null ? (
      screen
    ) : (
      <HouseGate houseId={houseId}>
        <SubscriptionCheck>
          <div style={column}>
            <Breadcrumb houseId={houseId} guestId={guestId} routeName={routeName} />
            <HouseTabs houseId={houseId} routeName={routeName} />
            {screen}
          </div>
        </SubscriptionCheck>
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
