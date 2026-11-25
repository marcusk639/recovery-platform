import { useEffect } from 'react';
import {
  useAdvanceRotation,
  useChoreRotation,
} from '../state/queries/choreRotationQueries';

function currentSundayISO(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

/**
 * Advances the house's chore rotation once a new week has started.
 *
 * `canAdvance` is whether the viewer is the house's staff (admin or owner
 * claim). The rules let only them update the rotation; residents can read it
 * but not advance it, so a resident's House Summary must not try.
 */
export function useAutoAdvanceRotation(houseId: string, canAdvance: boolean) {
  const { data: rotation } = useChoreRotation(houseId, !!houseId);
  const { mutate: advance } = useAdvanceRotation(houseId);

  useEffect(() => {
    if (!rotation || !canAdvance) return;
    const thisSunday = currentSundayISO();
    if (rotation.lastRotatedAt < thisSunday) {
      advance();
    }
  }, [rotation, advance, canAdvance]);
}
