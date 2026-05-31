import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logException } from '../../util/logging';
import { Guest } from '../../entities/Guest';
import {
  getOccupancyReport,
  getComplianceTrend,
  getDischargeReport,
  DischargePeriod,
  OccupancyReport,
  ComplianceTrend,
  DischargeReport,
} from '../../services/reportingService';

export const reportingKeys = {
  all: ['reporting'] as const,
  occupancy: (houseId: string) =>
    [...reportingKeys.all, 'occupancy', houseId] as const,
  compliance: (houseId: string, weeksBack: number) =>
    [...reportingKeys.all, 'compliance', houseId, weeksBack] as const,
  discharge: (houseId: string, daysBack: DischargePeriod) =>
    [...reportingKeys.all, 'discharge', houseId, daysBack] as const,
};

export const useOccupancyReport = (
  houseId: string,
  activeGuests: Guest[],
  capacity: number,
  enabled: boolean = true,
) => {
  const result = useQuery<OccupancyReport>({
    queryKey: [
      ...reportingKeys.occupancy(houseId),
      activeGuests.length,
      capacity,
    ],
    queryFn: () => getOccupancyReport(houseId, activeGuests, capacity),
    enabled: enabled && !!houseId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (result.error) {
      logException(result.error);
    }
  }, [result.error]);

  return result;
};

export const useComplianceTrend = (
  houseId: string,
  guestIds: string[],
  weeksBack: number = 4,
  enabled: boolean = true,
) => {
  const result = useQuery<ComplianceTrend>({
    queryKey: reportingKeys.compliance(houseId, weeksBack),
    queryFn: () => getComplianceTrend(houseId, guestIds, weeksBack),
    enabled: enabled && !!houseId && guestIds.length > 0,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (result.error) {
      logException(result.error);
    }
  }, [result.error]);

  return result;
};

export const useDischargeReport = (
  houseId: string,
  allGuests: Guest[],
  daysBack: DischargePeriod = 30,
  enabled: boolean = true,
) => {
  const result = useQuery<DischargeReport>({
    queryKey: [...reportingKeys.discharge(houseId, daysBack), allGuests.length],
    queryFn: () => getDischargeReport(houseId, allGuests, daysBack),
    enabled: enabled && !!houseId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (result.error) {
      logException(result.error);
    }
  }, [result.error]);

  return result;
};
