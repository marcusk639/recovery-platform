import { useCallback, useEffect, useState } from 'react';
import { WEB_PORTAL_URL } from '@mobile/screens/Subscription/SubscriptionRequiredScreen';
import { getHealthByPercentage, HEALTH_STATUS_MAP } from '@mobile/util/guest';
import { operatorHouseIds } from './access';
import { HouseTable } from './houses/HouseTable';
import type { HouseSummary } from './houses/summary';
import { useHouseSummary } from './houses/useHouseSummary';
import { heading, page } from './ui';
import { useRoles } from './useRoles';

const titleCase = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();
export const healthLabel = (percent: number): string =>
  titleCase((HEALTH_STATUS_MAP as Record<string, string>)[getHealthByPercentage(percent)] ?? '');

const loadingSummary = (houseId: string): HouseSummary => ({
  houseId,
  name: null,
  house: { state: 'loading' },
  subscription: 'loading',
  graceEndsAt: null,
  beds: { state: 'loading' },
  healthPercent: { state: 'loading' },
  rentOverdueCents: { state: 'loading' },
  overdueFromDischargedCents: 0,
  applicationsWaiting: { state: 'loading' },
  openDisputes: { state: 'loading' },
});

// One per house, because the number of houses varies and hooks can't run in a loop.
function HouseSummaryReporter({ houseId, report }: { houseId: string; report: (summary: HouseSummary) => void }) {
  const summary = useHouseSummary(houseId);
  const key = JSON.stringify(summary);
  useEffect(() => report(summary), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Houses come from roles, so staff with no admin record see theirs too.
export function Home() {
  const houseIds = operatorHouseIds(useRoles());
  const [reported, setReported] = useState<Record<string, HouseSummary>>({});
  const report = useCallback((summary: HouseSummary) => {
    setReported((current) => ({ ...current, [summary.houseId]: summary }));
  }, []);
  const summaries = houseIds.map((houseId) => reported[houseId] ?? loadingSummary(houseId));
  return (
    <div style={page}>
      <h1 style={heading}>All houses</h1>
      {houseIds.map((houseId) => (
        <HouseSummaryReporter key={houseId} houseId={houseId} report={report} />
      ))}
      <HouseTable summaries={summaries} healthLabel={healthLabel} manageSubscriptionUrl={WEB_PORTAL_URL} />
    </div>
  );
}
