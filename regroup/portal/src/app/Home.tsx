import { useHouse } from '@mobile/state/queries/houseQueries';
import { operatorHouseIds } from './access';
import { HouseLink } from './HouseLink';
import { SECTIONS, sectionPath } from './urls';
import { useRoles } from './useRoles';

function HouseRow({ houseId }: { houseId: string }) {
  const { data, error } = useHouse(houseId, true);
  return (
    <li style={{ padding: '6px 0' }}>
      <HouseLink href={sectionPath(houseId, 'summary')} route={SECTIONS.summary.route} params={{ houseId }}>
        {data?.name ?? houseId}
      </HouseLink>
      {error && <span role="alert"> (could not load its details)</span>}
    </li>
  );
}

// A simple list for now, from roles, so it works for staff with no admin record.
// P3 replaces it with the all-houses table.
export function Home() {
  const houseIds = operatorHouseIds(useRoles());
  return (
    <div style={{ padding: 24, font: '15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 20 }}>Your houses</h1>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {houseIds.map((houseId) => (
          <HouseRow key={houseId} houseId={houseId} />
        ))}
      </ul>
    </div>
  );
}
