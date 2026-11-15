import { useMemo, useState } from 'react';
import { useCurrentWeek } from '@mobile/hooks/activity/useCurrentWeek';
import { useSelectedHouse } from '@mobile/hooks/useSelectedHouse';
import { useGuests } from '@mobile/state/queries/guestQueries';
import { getTodaysDate } from '@mobile/util/display';
import { getOverallPercentage } from '@mobile/util/guest';
import { canScore } from '../houses/summary';
import { useWeekSummaries } from '../houses/useHouseSummary';
import { SortHeader } from '../SortHeader';
import { nextSort, sortRows, type SortState } from '../sort';
import { muted, table } from '../ui';
import { useHouseAccess } from '../useHouseAccess';
import { ResidentRow, type Week } from './ResidentRow';
import { currentResidents, fullName, matchesName, type ResidentKey, roomOf, tableStateFor } from './rows';

const COLUMNS: { key: ResidentKey; label: string }[] = [
  { key: 'name', label: 'Resident' },
  { key: 'status', label: 'Status' },
  { key: 'phase', label: 'Phase' },
  { key: 'room', label: 'Room' },
  { key: 'movedIn', label: 'Moved in' },
  { key: 'week', label: 'This week' },
  { key: 'balance', label: 'Balance' },
];

const dayValue = (value: unknown) => {
  const time = typeof value === 'string' ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? null : time;
};

export function ResidentTable({ houseId }: { houseId: string }) {
  const { house } = useSelectedHouse() as { house: any };
  const { view } = useHouseAccess(houseId);
  const showBalance = view === 'full';
  const { startDate } = useCurrentWeek(house?.timezone);
  const guestsQuery = useGuests(houseId, !!houseId);
  const residents = useMemo(() => currentResidents((guestsQuery.data ?? {}) as Record<string, any>), [guestsQuery.data]);
  const weeks = useWeekSummaries(residents.map((guest) => guest.id), startDate, !!house);

  const saved = tableStateFor(houseId);
  const [sort, setSortState] = useState<SortState<ResidentKey>>(saved.sort);
  const [filter, setFilterState] = useState(saved.filter);
  const setSort = (next: SortState<ResidentKey>) => setSortState((saved.sort = next));
  const setFilter = (next: string) => setFilterState((saved.filter = next));

  if (guestsQuery.status === 'error') {
    return (
      <p>
        Couldn't load residents.{' '}
        <button type="button" onClick={() => guestsQuery.refetch()}>
          Try again
        </button>
      </p>
    );
  }
  if (guestsQuery.status !== 'success' || !house) return <p role="status" style={muted}>Loading residents…</p>;

  const today = getTodaysDate();
  const rows = residents.map((guest, i) => {
    const query = weeks[i];
    let week: Week = { state: 'loading' };
    if (!canScore(guest, house)) week = { state: 'unscored' };
    else if (query?.status === 'error') week = { state: 'error' };
    else if (query?.status === 'success') {
      week = { state: 'ready', percent: getOverallPercentage(guest, house, today, undefined, query.data?.stats) };
    }
    return { guest, week, room: roomOf(house.rooms, guest.id) };
  });

  const value = (row: (typeof rows)[number]): string | number | null => {
    const { guest } = row;
    if (sort.key === 'name') return fullName(guest);
    if (sort.key === 'status') return guest.status ?? 'active';
    if (sort.key === 'phase') return String(guest.phase ?? '');
    if (sort.key === 'room') return row.room;
    if (sort.key === 'movedIn') return dayValue(guest.moveInDate);
    if (sort.key === 'week') return row.week.state === 'ready' ? row.week.percent : null;
    return typeof guest.rentOwed === 'number' && Number.isFinite(guest.rentOwed) ? guest.rentOwed : guest.rentOwed === undefined ? 0 : null;
  };
  const shown = sortRows(rows.filter((row) => matchesName(row.guest, filter)), value, sort.direction);
  const columns = COLUMNS.filter((c) => c.key !== 'balance' || showBalance);

  return (
    <div data-testid="guest-list-screen">
      <input
        type="search"
        aria-label="Filter by name"
        placeholder="Filter by name"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        style={{ margin: '0 0 12px', padding: '6px 10px', width: 260, maxWidth: '100%', font: 'inherit' }}
      />
      {residents.length === 0 ? (
        <p style={muted}>No residents in this house yet.</p>
      ) : shown.length === 0 ? (
        <p style={muted}>No residents match that name.</p>
      ) : (
        <table style={table}>
          <thead>
            <tr>
              {columns.map(({ key, label }) => (
                <SortHeader key={key} label={label} active={sort.key === key} direction={sort.direction} onSort={() => setSort(nextSort(sort, key))} />
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <ResidentRow key={row.guest.id} guest={row.guest} houseId={houseId} room={row.room} week={row.week} showBalance={showBalance} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
