// Reads one house through the phone's hooks and cache keys, so it shares data with
// reused screens, and turns it into a HouseSummary.
import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useCurrentWeek } from '@mobile/hooks/activity/useCurrentWeek';
import { LIVE_DISPUTES } from '@mobile/hooks/useLiveHouseDisputes';
import { usePaywallKillSwitch } from '@mobile/hooks/useSubscriptionGate';
import * as activityService from '@mobile/services/activity';
import { activityKeys } from '@mobile/state/queries/activityQueries';
import { useHouseApplications } from '@mobile/state/queries/applicationQueries';
import { useGuests } from '@mobile/state/queries/guestQueries';
import { useHouse } from '@mobile/state/queries/houseQueries';
import { getTodaysDate } from '@mobile/util/display';
import { toDateSafe } from '@mobile/util/firestore';
import { getOverallPercentage } from '@mobile/util/guest';
import { countBeds, countOpenDisputes } from '@mobile/util/house';
import { firestore } from '../../adapter/firebase-setup';
import { collection, doc, getDoc } from '../../adapter/firebase/firestore';
import { useHouseAccess } from '../useHouseAccess';
import {
  applicationsWaiting,
  canScore,
  type Cell,
  cellFrom,
  houseHealth,
  type HouseSummary,
  overdueFromDischarged,
  rentOverdue,
  subscriptionStateOf,
} from './summary';

export const liveDisputesKey = (houseId: string) => ['disputes', 'house-live', houseId] as const;

// The week summaries the phone's useWeekSummary reads, one per resident.
export function useWeekSummaries(guestIds: string[], weekStart: string, enabled: boolean) {
  return useQueries({
    queries: guestIds.map((guestId) => ({
      queryKey: activityKeys.weekSummary(guestId, weekStart),
      queryFn: () => activityService.getWeekSummary(guestId, weekStart),
      enabled: enabled && !!weekStart,
      staleTime: 60_000,
    })),
  });
}

// Not useLiveHouseDisputes: it has no loading state, so its first render reads as
// "no disputes". Approving or rejecting a dispute invalidates nothing, so this
// refetches whenever a page using it opens.
export function useOpenDisputes(houseId: string, enabled: boolean) {
  return useQuery({
    queryKey: liveDisputesKey(houseId),
    queryFn: async () => {
      const snapshot = await getDoc(doc(collection(firestore, LIVE_DISPUTES), houseId));
      return ((snapshot.exists() ? snapshot.data()?.disputes : undefined) ?? {}) as Record<string, any>;
    },
    enabled,
    staleTime: 0,
  });
}

const known = (value: number | null): Cell<number> =>
  value === null ? { state: 'error' } : { state: 'ready', value };

export function useHouseSummary(houseId: string): HouseSummary {
  const houseQuery = useHouse(houseId, true);
  const house = houseQuery.data as any;
  const killSwitch = usePaywallKillSwitch();
  const { view } = useHouseAccess(houseId);
  const { startDate: weekStart } = useCurrentWeek(house?.timezone);

  const subscription = house
    ? subscriptionStateOf(house, { enabled: killSwitch.killSwitchEnabled, isLoading: killSwitch.isLoading }, new Date(), toDateSafe)
    : { state: 'loading' as const, graceEndsAt: null };
  const open = subscription.state === 'active' || subscription.state === 'grace';

  const guestsQuery = useGuests(houseId, open);
  const applicationsQuery = useHouseApplications(houseId, open);
  const disputesQuery = useOpenDisputes(houseId, open);
  const guests = useMemo(() => Object.values((guestsQuery.data ?? {}) as Record<string, any>), [guestsQuery.data]);
  const current = useMemo(() => guests.filter((guest) => guest.status !== 'discharged'), [guests]);
  const weeks = useWeekSummaries(current.map((guest) => guest.id), weekStart, open && !!house);

  let healthPercent: Cell<number | null> = { state: 'loading' };
  if (guestsQuery.status === 'error' || weeks.some((week) => week.status === 'error')) {
    healthPercent = { state: 'error' };
  } else if (guestsQuery.status === 'success' && house && weeks.every((week) => week.status === 'success')) {
    const today = getTodaysDate();
    const percents = current.map((guest, i) =>
      canScore(guest, house) ? getOverallPercentage(guest, house, today, undefined, weeks[i].data?.stats) : null,
    );
    healthPercent = { state: 'ready', value: houseHealth(percents) };
  }

  let rentOverdueCents: Cell<number> = { state: 'loading' };
  if (view === 'limited') rentOverdueCents = { state: 'hidden' };
  else if (view === 'full' && guestsQuery.status === 'error') rentOverdueCents = { state: 'error' };
  else if (view === 'full' && guestsQuery.status === 'success') rentOverdueCents = known(rentOverdue(guests));

  return {
    houseId,
    name: house?.name ?? null,
    house: cellFrom(houseQuery, () => true as const),
    subscription: subscription.state,
    graceEndsAt: subscription.graceEndsAt,
    beds: cellFrom(houseQuery, (h: any) => countBeds(h.rooms ?? {})),
    healthPercent,
    rentOverdueCents,
    overdueFromDischargedCents: view === 'full' ? overdueFromDischarged(guests) : 0,
    applicationsWaiting: cellFrom(applicationsQuery, (list: any[]) => applicationsWaiting(list ?? [])),
    openDisputes: cellFrom(disputesQuery, (disputes) => countOpenDisputes({ disputes } as any)),
  };
}
