import React from 'react';
import { useAppSelector } from '../../state/store';
import RequireHouseRole, { HouseRank } from './RequireHouseRole';

type ScreenProps = { route?: { params?: { houseId?: string } } };

/**
 * Registers a screen behind RequireHouseRole. The house checked is the one the
 * screen works on: the route's `houseId` when it takes one (a link or a caller
 * can name any house), else the selected house.
 */
export function withHouseRole<P extends object>(
  Screen: React.ComponentType<P>,
  minRank: HouseRank,
): React.FC<P> {
  const Guarded: React.FC<P> = (props) => {
    const selectedHouseId = useAppSelector((s) => s.houses.selectedHouseId ?? null);
    const houseId = (props as ScreenProps).route?.params?.houseId ?? selectedHouseId;
    return (
      <RequireHouseRole houseId={houseId} minRank={minRank}>
        <Screen {...props} />
      </RequireHouseRole>
    );
  };
  Guarded.displayName = `withHouseRole(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return Guarded;
}
