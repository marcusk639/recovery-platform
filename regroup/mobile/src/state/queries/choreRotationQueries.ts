import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as choreRotationService from '../../services/choreRotation';
import { ChoreRotation } from '../../entities/Chore';
import { logException } from '../../util/logging';

// ── Query Keys ────────────────────────────────────────────────────────────────

export const choreRotationKeys = {
  all: ['choreRotations'] as const,
  rotation: (houseId: string) => [...choreRotationKeys.all, houseId] as const,
};

// ── useChoreRotation ──────────────────────────────────────────────────────────

export const useChoreRotation = (houseId: string, enabled: boolean = true) => {
  const result = useQuery({
    queryKey: choreRotationKeys.rotation(houseId),
    queryFn: () => choreRotationService.getRotation(houseId),
    enabled: enabled && !!houseId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (result.error) logException(result.error);
  }, [result.error]);

  return result;
};

// ── useAdvanceRotation ────────────────────────────────────────────────────────

export const useAdvanceRotation = (houseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => choreRotationService.advanceRotation(houseId),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: choreRotationKeys.rotation(houseId),
      });
    },
    onError: (error: unknown) => logException(error),
  });
};

// ── useSetRotationOrder ───────────────────────────────────────────────────────

export const useSetRotationOrder = (houseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      choreName,
      guestIds,
    }: {
      choreName: string;
      guestIds: string[];
    }) => choreRotationService.setRotationOrder(houseId, choreName, guestIds),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: choreRotationKeys.rotation(houseId),
      });
    },
    onError: (error: unknown) => logException(error),
  });
};
