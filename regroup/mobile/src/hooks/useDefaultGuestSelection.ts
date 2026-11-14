import { useEffect } from 'react';
import { Guest } from '../entities/Guest';
import { useGuests } from '../state/queries';
import { selectGuestById } from '../state/slices/guestsSlice';
import { useAppDispatch, useAppSelector } from '../state/store';

const byName = (a: Guest, b: Guest) =>
  `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`) ||
  a.id.localeCompare(b.id);

function defaultGuestId(guests: Record<string, Guest>, userId?: string): string | null {
  const current = Object.values(guests).filter((guest) => guest.status !== 'discharged');
  const own = current.find((guest) => guest.userId === userId);
  return own?.id ?? current.sort(byName)[0]?.id ?? null;
}

/**
 * Keeps staff's selected guest inside the selected house: it picks a resident
 * when none is selected, and replaces one left over from another house after
 * Change home. A resident's selection is their own record, set at sign-in.
 */
export function useDefaultGuestSelection(): { isLoading: boolean } {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);
  const houseId = useAppSelector((state) => state.houses.selectedHouseId);
  const selectedGuestId = useAppSelector((state) => state.guests.selectedGuestId);

  const { data: guests, isLoading } = useGuests(houseId ?? '', !!user?.isAdmin && !!houseId);

  useEffect(() => {
    if (!guests || (selectedGuestId && guests[selectedGuestId])) {
      return;
    }
    const next = defaultGuestId(guests as Record<string, Guest>, user?.id);
    if (next !== selectedGuestId) {
      dispatch(selectGuestById(next));
    }
  }, [guests, selectedGuestId, user?.id, dispatch]);

  return { isLoading };
}
