import { useAppSelector } from '../state/store';
import { useHouse } from '../state/queries/houseQueries';
import { House } from '../entities/House';

export function useSelectedHouse(): {
  house: House | null;
  houseId: string | null;
  isLoading: boolean;
} {
  // Read selection from the id-only field. The legacy
  // state.houses.selectedHouse.id fallback was removed in Phase D —
  // nothing in src/ dispatches selectHouse(House) anymore, so the
  // fallback was dead code.
  const selectedHouseId = useAppSelector(s => s.houses.selectedHouseId ?? null);

  // Fetch full entity from React Query cache
  const { data, isLoading } = useHouse(
    selectedHouseId ?? '',
    !!selectedHouseId,
  );

  return {
    house: data ?? null,
    houseId: selectedHouseId,
    isLoading,
  };
}
