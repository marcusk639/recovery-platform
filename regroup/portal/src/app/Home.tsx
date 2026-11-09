import { useSelector } from 'react-redux';
import { useHousesByAdmin } from '@mobile/state/queries';
import { canAccessHouse } from './access';
import { HouseLink } from './HouseLink';
import { SECTIONS, sectionPath } from './urls';
import { useRoles } from './useRoles';

// A simple list for now. P3 replaces it with the all-houses table.
export function Home() {
  const adminId = useSelector((state: any) => state.user.user?.adminId) ?? '';
  const { data, isLoading, error } = useHousesByAdmin(adminId, !!adminId);
  const roles = useRoles();
  const houses = Object.values((data ?? {}) as Record<string, { id: string; name?: string }>).filter((house) =>
    canAccessHouse(roles, house.id),
  );
  return (
    <div style={{ padding: 24, font: '15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 20 }}>Your houses</h1>
      {isLoading && <p role="status">Loading...</p>}
      {error && <p role="alert">Could not load your houses.</p>}
      {!isLoading && !error && houses.length === 0 && <p>No houses to show.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {houses.map((house) => (
          <li key={house.id} style={{ padding: '6px 0' }}>
            <HouseLink href={sectionPath(house.id, 'summary')} route={SECTIONS.summary.route} params={{ houseId: house.id }}>
              {house.name ?? house.id}
            </HouseLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
