import { useEffect, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSelectedHouse } from '@mobile/hooks/useSelectedHouse';
import { selectHouseById } from '@mobile/state/slices/housesSlice';
import { canAccessHouse } from './access';
import { useCurrentHouseId } from './current-house';
import { useRoles } from './useRoles';

const message = { margin: 'auto', font: '15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' };

// Nothing below this renders, and so nothing reads, until the house in the URL is
// one the operator runs. Screens also wait for the house and user, because
// Disputes.tsx crashes if it first renders without them (#193).
export function HouseGate({ children }: { children: ReactNode }) {
  const dispatch = useDispatch();
  const houseId = useCurrentHouseId();
  const roles = useRoles();
  const allowed = houseId !== null && canAccessHouse(roles, houseId);
  const { house, houseId: selectedId, isLoading } = useSelectedHouse();
  const userId = useSelector((state: any) => state.user.user?.id);

  useEffect(() => {
    if (allowed && selectedId !== houseId) dispatch(selectHouseById(houseId));
  }, [allowed, selectedId, houseId, dispatch]);

  if (houseId === null) return <>{children}</>;
  if (!allowed) {
    return (
      <div style={message}>
        <p>You don't have access to this house.</p>
        <p>
          <a href="/">Back to your houses</a>
        </p>
      </div>
    );
  }
  if (selectedId === houseId && house && userId) return <>{children}</>;
  const loading = selectedId !== houseId || isLoading;
  return (
    <p role="status" style={message}>
      {loading ? 'Loading this house...' : 'Could not load this house.'}
    </p>
  );
}
