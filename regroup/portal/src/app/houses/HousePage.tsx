import { useNavigation } from '@react-navigation/native';
import { useSelectedHouse } from '@mobile/hooks/useSelectedHouse';
import { ResidentTable } from '../residents/ResidentTable';
import { page } from '../ui';
import { areasFor } from './areas';
import { HouseNumbers } from './HouseNumbers';

const button = {
  padding: '6px 12px',
  border: '1px solid #b9c6cf',
  borderRadius: 6,
  background: '#fff',
  color: '#1f5f8b',
  font: 'inherit',
  cursor: 'pointer',
};

// One house: its numbers, what else it offers, and its residents. HouseGate has
// already selected the house in the URL.
export function HousePage() {
  const navigation = useNavigation<any>();
  const { house } = useSelectedHouse();
  if (!house) return null;
  return (
    <div style={page}>
      <HouseNumbers houseId={house.id} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {areasFor(house as any).map((area) => (
          <button key={area.label} type="button" style={button} onClick={() => navigation.navigate(area.route, area.params)}>
            {area.label}
          </button>
        ))}
      </div>
      <ResidentTable houseId={house.id} />
    </div>
  );
}
