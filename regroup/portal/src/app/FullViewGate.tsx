import type { ReactNode } from 'react';
import { needsFullView } from './houses/areas';
import { Notice, noticeStyle } from './Notice';
import { useHouseAccess } from './useHouseAccess';

// Payments, reports and balances by URL or bookmark, for a peer leader or while the
// role is still being checked. Display only: the rules still decide what can be read.
export function FullViewGate({ houseId, routeName, children }: { houseId: string; routeName: string; children: ReactNode }) {
  const { view } = useHouseAccess(houseId);
  if (!needsFullView(routeName) || view === 'full') return <>{children}</>;
  if (view === 'checking') {
    return (
      <p role="status" style={noticeStyle}>
        Checking your access...
      </p>
    );
  }
  return <Notice title="This page isn't available for your role." />;
}
