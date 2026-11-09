import { useState } from 'react';
import { HouseLink } from '../HouseLink';
import { SortHeader } from '../SortHeader';
import { nextSort, sortRows, type SortState } from '../sort';
import { card, cardLabel, cards, cardValue, link, muted, table, td, warning } from '../ui';
import { SECTIONS, sectionPath } from '../urls';
import { bedsText, CellText, healthText } from './HouseCell';
import { type Cell, formatCents, formatDay, type HouseSummary, rowStateOf, totalsFor } from './summary';

type Key = 'name' | 'beds' | 'health' | 'overdue' | 'applications' | 'disputes';

const COLUMNS: { key: Exclude<Key, 'name'>; label: string }[] = [
  { key: 'beds', label: 'Beds' },
  { key: 'health', label: 'Health' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'applications', label: 'Applications' },
  { key: 'disputes', label: 'Disputes' },
];

const readyValue = <T,>(cell: Cell<T>, pick: (value: T) => number | null): number | null =>
  cell.state === 'ready' ? pick(cell.value) : null;

function sortValue(summary: HouseSummary, key: Key): string | number | null {
  if (key === 'name') return summary.name ?? summary.houseId;
  if (rowStateOf(summary) !== 'numbers') return null;
  if (key === 'beds') return readyValue(summary.beds, (b) => b.used);
  if (key === 'health') return readyValue(summary.healthPercent, (h) => h);
  if (key === 'overdue') return readyValue(summary.rentOverdueCents, (c) => c);
  if (key === 'applications') return readyValue(summary.applicationsWaiting, (n) => n);
  return readyValue(summary.openDisputes, (n) => n);
}

interface Props {
  summaries: HouseSummary[];
  healthLabel?: (percent: number) => string;
  manageSubscriptionUrl?: string;
}

function Row({ summary, healthLabel, manageSubscriptionUrl }: Props & { summary: HouseSummary }) {
  const state = rowStateOf(summary);
  const name = (
    <td style={td}>
      <HouseLink
        href={sectionPath(summary.houseId, 'summary')}
        route={SECTIONS.summary.route}
        params={{ houseId: summary.houseId }}
        style={link}>
        {summary.name ?? summary.houseId}
      </HouseLink>
      {summary.subscription === 'grace' && summary.graceEndsAt && (
        <div style={{ ...warning, fontSize: 12 }}>Subscription ending {formatDay(summary.graceEndsAt)}</div>
      )}
    </td>
  );
  if (state === 'failed' || state === 'lapsed' || state === 'setting-up') {
    return (
      <tr>
        {name}
        <td style={td} colSpan={COLUMNS.length}>
          {state === 'failed' && <span style={warning}>Couldn't load this house.</span>}
          {state === 'setting-up' && <span style={muted}>Setting up</span>}
          {state === 'lapsed' && (
            <span>
              <span style={warning}>Subscription ended</span>
              {manageSubscriptionUrl && (
                <>
                  {' · '}
                  <a href={manageSubscriptionUrl} target="_blank" rel="noreferrer" style={link}>
                    Manage subscription
                  </a>
                </>
              )}
            </span>
          )}
        </td>
      </tr>
    );
  }
  const loading: Cell<never> = { state: 'loading' };
  const cell = <T,>(value: Cell<T>) => (state === 'loading' ? loading : value);
  return (
    <tr>
      {name}
      <td style={td}>
        <CellText cell={cell(summary.beds)} render={bedsText} />
      </td>
      <td style={td}>
        <CellText cell={cell(summary.healthPercent)} render={(p) => healthText(p, healthLabel)} />
      </td>
      <td style={td}>
        <CellText cell={cell(summary.rentOverdueCents)} render={formatCents} />
      </td>
      <td style={td}>
        <CellText cell={cell(summary.applicationsWaiting)} render={String} />
      </td>
      <td style={td}>
        <CellText cell={cell(summary.openDisputes)} render={String} />
      </td>
    </tr>
  );
}

function Totals({ summaries }: { summaries: HouseSummary[] }) {
  const totals = totalsFor(summaries);
  const showOverdue = summaries.some((s) => s.rentOverdueCents.state !== 'hidden');
  const total = (label: string, value: string, testId: string) => (
    <div style={card} data-testid={testId}>
      <div style={cardLabel}>{label}</div>
      <div style={cardValue}>{value}</div>
    </div>
  );
  return (
    <>
      <div style={cards}>
        {total('Beds filled', `${totals.beds.value.used} / ${totals.beds.value.max}`, 'total-beds')}
        {showOverdue && total('Rent overdue', formatCents(totals.rentOverdueCents.value), 'total-overdue')}
        {total('Applications waiting', String(totals.applicationsWaiting.value), 'total-applications')}
        {total('Open disputes', String(totals.openDisputes.value), 'total-disputes')}
      </div>
      {totals.housesNotCounted > 0 && (
        <p role="status" style={{ ...warning, margin: '0 0 12px' }}>
          Not counting {totals.housesNotCounted} of {summaries.length} houses, which are loading or couldn't be read.
        </p>
      )}
    </>
  );
}

export function HouseTable(props: Props) {
  const [sort, setSort] = useState<SortState<Key>>({ key: 'name', direction: 'asc' });
  const rows = sortRows(props.summaries, (s) => sortValue(s, sort.key), sort.direction);
  return (
    <>
      <Totals summaries={props.summaries} />
      <table style={table}>
        <thead>
          <tr>
            <SortHeader label="House" active={sort.key === 'name'} direction={sort.direction} onSort={() => setSort(nextSort(sort, 'name'))} />
            {COLUMNS.map(({ key, label }) => (
              <SortHeader key={key} label={label} active={sort.key === key} direction={sort.direction} onSort={() => setSort(nextSort(sort, key))} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((summary) => (
            <Row key={summary.houseId} {...props} summary={summary} />
          ))}
        </tbody>
      </table>
    </>
  );
}
