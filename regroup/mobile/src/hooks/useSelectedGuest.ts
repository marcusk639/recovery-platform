import { useAppSelector } from '../state/store';
import { useGuest } from '../state/queries/guestQueries';
import { Guest } from '../entities/Guest';

export function useSelectedGuest(): {
  guest: Guest | null;
  guestId: string | null;
  isLoading: boolean;
} {
  // Id-only selection. The legacy state.guests.selectedGuest.id
  // fallback was removed in Phase D — nothing in src/ dispatches
  // selectGuest(Guest) anymore, so the fallback was dead code.
  const selectedGuestId = useAppSelector(s => s.guests.selectedGuestId ?? null);

  const { data, isLoading } = useGuest(
    selectedGuestId ?? '',
    !!selectedGuestId,
  );

  return {
    guest: data ?? null,
    guestId: selectedGuestId,
    isLoading,
  };
}
