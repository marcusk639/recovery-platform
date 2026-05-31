import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as treasury from '../../services/treasury';
import type { FinancialRecord } from '../../entities/oxford/FinancialRecord';

export const treasuryKeys = {
  all: ['treasury'] as const,
  records: (houseId: string) =>
    [...treasuryKeys.all, 'records', houseId] as const,
  record: (houseId: string, id: string) =>
    [...treasuryKeys.all, 'record', houseId, id] as const,
  currentWeek: (houseId: string) =>
    [...treasuryKeys.all, 'current-week', houseId] as const,
  previousWeek: (houseId: string) =>
    [...treasuryKeys.all, 'previous-week', houseId] as const,
  eesIncome: (houseId: string, weekStart: string) =>
    [...treasuryKeys.all, 'ees', houseId, weekStart] as const,
};

export function useFinancialRecords(houseId: string, enabled = true) {
  return useQuery({
    queryKey: treasuryKeys.records(houseId),
    queryFn: () => treasury.getFinancialRecords(houseId),
    enabled: enabled && !!houseId,
    staleTime: 60000,
  });
}

export function useCurrentWeekRecord(houseId: string, enabled = true) {
  return useQuery({
    queryKey: treasuryKeys.currentWeek(houseId),
    queryFn: () => treasury.getCurrentWeekRecord(houseId),
    enabled: enabled && !!houseId,
    staleTime: 60000,
  });
}

export function usePreviousWeekRecord(houseId: string, enabled = true) {
  return useQuery({
    queryKey: treasuryKeys.previousWeek(houseId),
    queryFn: () => treasury.getPreviousWeekRecord(houseId),
    enabled: enabled && !!houseId,
    staleTime: 60000,
  });
}

export function useEESIncomeForWeek(
  houseId: string,
  weekStart: string,
  enabled = true,
) {
  return useQuery({
    queryKey: treasuryKeys.eesIncome(houseId, weekStart),
    queryFn: () => treasury.getEESIncomeForWeek(houseId, weekStart),
    enabled: enabled && !!houseId && !!weekStart,
    staleTime: 60000,
  });
}

function useInvalidateTreasury() {
  const qc = useQueryClient();
  return (houseId: string) => {
    qc.invalidateQueries({ queryKey: treasuryKeys.records(houseId) });
    qc.invalidateQueries({ queryKey: treasuryKeys.currentWeek(houseId) });
  };
}

export function useCreateFinancialRecord() {
  const invalidate = useInvalidateTreasury();
  return useMutation({
    mutationFn: ({
      houseId,
      record,
    }: {
      houseId: string;
      record: Omit<FinancialRecord, 'id'>;
    }) => treasury.createFinancialRecord(houseId, record),
    onSuccess: result => invalidate(result.houseId),
  });
}

export function useUpdateFinancialRecord() {
  const invalidate = useInvalidateTreasury();
  return useMutation({
    mutationFn: ({
      houseId,
      recordId,
      data,
    }: {
      houseId: string;
      recordId: string;
      data: Partial<FinancialRecord>;
    }) => treasury.updateFinancialRecord(houseId, recordId, data),
    onSuccess: (_data, { houseId }) => invalidate(houseId),
  });
}

export function useSubmitForApproval() {
  const invalidate = useInvalidateTreasury();
  return useMutation({
    mutationFn: ({
      houseId,
      recordId,
    }: {
      houseId: string;
      recordId: string;
    }) => treasury.submitForApproval(houseId, recordId),
    onSuccess: (_data, { houseId }) => invalidate(houseId),
  });
}

export function useApproveRecord() {
  const invalidate = useInvalidateTreasury();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      houseId,
      recordId,
      userId,
    }: {
      houseId: string;
      recordId: string;
      userId: string;
    }) => treasury.approveRecord(houseId, recordId, userId),
    onSuccess: (_data, { houseId, recordId }) => {
      invalidate(houseId);
      qc.invalidateQueries({
        queryKey: treasuryKeys.record(houseId, recordId),
      });
    },
  });
}

export function useRejectRecord() {
  const invalidate = useInvalidateTreasury();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      houseId,
      recordId,
      reason,
    }: {
      houseId: string;
      recordId: string;
      reason: string;
    }) => treasury.rejectRecord(houseId, recordId, reason),
    onSuccess: (_data, { houseId, recordId }) => {
      invalidate(houseId);
      qc.invalidateQueries({
        queryKey: treasuryKeys.record(houseId, recordId),
      });
    },
  });
}
