import { useMemo } from 'react';
import {
  useHouseVotes,
  useBusinessMeetings,
  useEESRecordsRecent,
  useFinancialRecords,
} from './oxfordQueries';
import { useHouseDrugTests } from './drugTestQueries';
import { useGuests } from './guestQueries';
import { computeCharterCompliance } from '../../services/oxford/charterCompliance';
import { CharterComplianceSummary } from '../../entities/oxford/CharterCompliance';
import { CHARTER_THRESHOLDS } from '../../entities/oxford';

export interface UseCharterComplianceResult {
  summary: CharterComplianceSummary | null;
  isLoading: boolean;
  isError: boolean;
}

export function useCharterCompliance(
  houseId: string,
  enabled = true,
): UseCharterComplianceResult {
  const votesQuery = useHouseVotes(houseId, enabled);
  const meetingsQuery = useBusinessMeetings(houseId, enabled);
  const eesQuery = useEESRecordsRecent(
    houseId,
    CHARTER_THRESHOLDS.recentEesWeeks,
    enabled,
  );
  const financialQuery = useFinancialRecords(houseId, enabled);
  const drugTestsQuery = useHouseDrugTests(houseId, enabled);
  const guestsQuery = useGuests(houseId, enabled);

  const isLoading =
    votesQuery.isLoading ||
    meetingsQuery.isLoading ||
    eesQuery.isLoading ||
    financialQuery.isLoading ||
    drugTestsQuery.isLoading ||
    guestsQuery.isLoading;

  const isError =
    votesQuery.isError ||
    meetingsQuery.isError ||
    eesQuery.isError ||
    financialQuery.isError ||
    drugTestsQuery.isError ||
    guestsQuery.isError;

  const summary = useMemo<CharterComplianceSummary | null>(() => {
    if (isLoading || isError) return null;

    const guests = guestsQuery.data ?? [];
    const inHouseGuestIds = new Set(
      guests.filter(g => g.status === 'active').map(g => g.id),
    );

    const financialRecords = financialQuery.data ?? [];

    return computeCharterCompliance({
      votes: votesQuery.data ?? [],
      meetings: meetingsQuery.data ?? [],
      activeResidentCount: inHouseGuestIds.size,
      recentEesRecords: eesQuery.data ?? [],
      latestFinancialRecord: financialRecords[0] ?? null,
      drugTests: drugTestsQuery.data ?? [],
      inHouseGuestIds,
    });
  }, [
    isLoading,
    isError,
    votesQuery.data,
    meetingsQuery.data,
    eesQuery.data,
    financialQuery.data,
    drugTestsQuery.data,
    guestsQuery.data,
  ]);

  return { summary, isLoading, isError };
}
