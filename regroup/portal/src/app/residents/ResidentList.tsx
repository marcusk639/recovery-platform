import { useSelectedHouse } from '@mobile/hooks/useSelectedHouse';
import { HouseNumbers } from '../houses/HouseNumbers';
import { page } from '../ui';
import { ResidentTable } from './ResidentTable';

// HouseGate has already selected the house in the URL.
export function ResidentList() {
  const { houseId } = useSelectedHouse();
  if (!houseId) return null;
  return (
    <div style={page}>
      <HouseNumbers houseId={houseId} />
      <ResidentTable houseId={houseId} />
    </div>
  );
}
