import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Admin from '../../entities/Admin';
import * as adminService from '../../services/admin';
import { House } from '../../entities/House';
import { houseKeys } from './houseQueries';

/**
 * Admin Query Hooks
 *
 * React Query hooks for managing admin/manager data from Firestore.
 */

// Query Keys
export const adminKeys = {
  all: ['admins'] as const,
  lists: () => [...adminKeys.all, 'list'] as const,
  list: (houseId: string) => [...adminKeys.lists(), houseId] as const,
  details: () => [...adminKeys.all, 'detail'] as const,
  detail: (adminId: string) => [...adminKeys.details(), adminId] as const,
};

/**
 * Fetch all admins for a house
 */
export const useHouseAdmins = (houseId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: adminKeys.list(houseId),
    queryFn: () => adminService.getHouseAdmins({ id: houseId } as House),
    enabled: enabled && !!houseId,
    staleTime: 30000,
  });
};

/**
 * Fetch a single admin by ID
 */
export const useAdmin = (adminId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: adminKeys.detail(adminId),
    queryFn: () => adminService.getAdmin(adminId),
    enabled: enabled && !!adminId,
    staleTime: 30000,
  });
};

/**
 * Update an admin
 */
export const useUpdateAdmin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      adminId,
      updates,
    }: {
      adminId: string;
      updates: Partial<Admin>;
    }) => adminService.updateAdmin(adminId, updates),

    onSuccess: (updatedAdmin, { adminId }) => {
      queryClient.setQueryData(adminKeys.detail(adminId), updatedAdmin);
      queryClient.invalidateQueries({ queryKey: adminKeys.lists() });
    },
  });
};

/**
 * Remove (delete) an admin from a house.
 *
 * Callers must pass houseId so the house detail cache (which holds the
 * adminIds array) is invalidated alongside the admin caches — otherwise
 * screens that read house.adminIds stay stale until the next house refetch.
 */
export const useDeleteAdmin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ adminId }: { adminId: string; houseId: string }) =>
      adminService.deleteAdmin(adminId),

    onSuccess: (adminId, { houseId }) => {
      queryClient.removeQueries({ queryKey: adminKeys.detail(adminId) });
      queryClient.invalidateQueries({ queryKey: adminKeys.lists() });
      queryClient.invalidateQueries({ queryKey: houseKeys.detail(houseId) });
    },
  });
};

/**
 * Create a new admin. Invalidates admin list + every house detail listed on
 * the new admin, because each house.adminIds array now points to this admin.
 */
export const useCreateAdmin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (admin: Admin) => adminService.createAdmin(admin),

    onSuccess: newAdmin => {
      queryClient.setQueryData(adminKeys.detail(newAdmin.id), newAdmin);
      queryClient.invalidateQueries({ queryKey: adminKeys.lists() });
      newAdmin.houseIds.forEach(houseId => {
        queryClient.invalidateQueries({ queryKey: houseKeys.detail(houseId) });
      });
    },
  });
};

/**
 * Send an admin/manager invitation email
 */
export const useInviteAdmin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      email,
      houseId,
      houseName,
    }: {
      email: string;
      houseId: string;
      houseName: string;
    }) => adminService.sendAdminInvite(email, houseId, houseName),

    onSuccess: (_data, { houseId }) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.list(houseId) });
    },
  });
};
