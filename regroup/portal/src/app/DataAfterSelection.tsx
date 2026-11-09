import { useEffect, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DataProvider } from '@mobile/context';
import { selectHouseById } from '@mobile/state/slices/housesSlice';
import { operatorHouseIds } from './access';
import { houseIdFromPath } from './urls';
import { useRoles } from './useRoles';

// The phone's DataProvider, at sign-in with no house selected, selects the first of
// the operator's houses and reads its residents, even when that house's
// subscription has ended. Selecting a house first, then mounting it, skips that
// read. The house in the URL wins, so HouseGate doesn't have to switch back.
export function DataAfterSelection({ children }: { children: ReactNode }) {
  const dispatch = useDispatch();
  const loggedIn = useSelector((state: any) => state.user.loggedIn);
  const selected = useSelector((state: any) => state.houses.selectedHouseId);
  const houseIds = operatorHouseIds(useRoles());
  const fromUrl = houseIdFromPath(location.pathname);
  const choice = fromUrl && houseIds.includes(fromUrl) ? fromUrl : houseIds[0];

  useEffect(() => {
    if (loggedIn && !selected && choice) dispatch(selectHouseById(choice));
  }, [loggedIn, selected, choice, dispatch]);

  const ready = loggedIn && (!!selected || !choice);
  return ready ? <DataProvider>{children}</DataProvider> : <>{children}</>;
}
