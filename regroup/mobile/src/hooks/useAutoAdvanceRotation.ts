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

export function useAutoAdvanceRotation(houseId: string) {
  const { data: rotation } = useChoreRotation(houseId, !!houseId);
  const { mutate: advance } = useAdvanceRotation(houseId);

  useEffect(() => {
    if (!rotation) return;
    const thisSunday = currentSundayISO();
    if (rotation.lastRotatedAt < thisSunday) {
      advance();
    }
  }, [rotation, advance]);
}
