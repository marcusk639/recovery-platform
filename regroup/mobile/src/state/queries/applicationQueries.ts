import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as applicationService from '../../services/applications';
import { ApplicationStatus } from '../../entities/Application';
import { auth } from '../../../firebase-setup';
import { logException } from '../../util/logging';

/**
 * Application Query Keys
 *
 * Organized by scope:
 * - all: base key for all application queries
 * - mine(uid): user's own applications
 * - houseList(houseId): applications for a specific house
 * - detail(houseId, appId): single application detail
 */
export const applicationKeys = {
  all: ['applications'] as const,
  mine: (uid: string) => [...applicationKeys.all, 'mine', uid] as const,
  houseList: (houseId: string) =>
    [...applicationKeys.all, 'house', houseId] as const,
  detail: (houseId: string, appId: string) =>
    [...applicationKeys.houseList(houseId), 'detail', appId] as const,
};

/**
 * Fetch all applications submitted by the current user
 *
 * @param enabled - Whether to enable the query (default: true)
 */
export const useMyApplications = (enabled = true) => {
  const uid = auth.currentUser?.uid ?? '';
  return useQuery({
    queryKey: applicationKeys.mine(uid),
    queryFn: () => applicationService.getMyApplications(),
    enabled: enabled && !!uid,
    staleTime: 30000, // 30 seconds
  });
};

/**
 * Fetch all applications for a specific house
 *
 * @param houseId - The house ID to fetch applications for
 * @param enabled - Whether to enable the query (default: true)
 */
export const useHouseApplications = (houseId: string, enabled = true) =>
  useQuery({
    queryKey: applicationKeys.houseList(houseId),
    queryFn: () => applicationService.listHouseApplications(houseId),
    enabled: enabled && !!houseId,
    staleTime: 15000, // 15 seconds
  });

/**
 * Submit a new application to a house
 *
 * Invalidates the user's application list after successful submission
 */
export const useSubmitApplication = () => {
  const queryClient = useQueryClient();
  const uid = auth.currentUser?.uid ?? '';

  return useMutation({
    mutationFn: ({
      houseId,
      data,
    }: {
      houseId: string;
      data: applicationService.ApplicationInput;
    }) => applicationService.submitApplication(houseId, data),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.mine(uid) });
    },
    onError: (error: Error) => logException(error),
  });
};

/**
 * Update the status of an application
 *
 * Used by operators to approve, reject, or review applications
 * Invalidates the house's application list after status change
 */
export const useUpdateApplicationStatus = (houseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      appId,
      status,
      note,
    }: {
      appId: string;
      status: ApplicationStatus;
      note?: string;
    }) =>
      applicationService.updateApplicationStatus(houseId, appId, status, note),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: applicationKeys.houseList(houseId),
      });
    },
    onError: (error: Error) => logException(error),
  });
};
