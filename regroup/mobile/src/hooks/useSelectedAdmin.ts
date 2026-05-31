import { useAppSelector } from '../state/store';
import { useAdmin } from '../state/queries/adminQueries';
import Admin from '../entities/Admin';

/**
 * Resolve the current user's Admin entity via the React Query cache.
 *
 * Unlike useSelectedHouse / useSelectedGuest — which track a Redux-held
 * selection ID that can change as the user navigates — the "selected admin"
 * for an app session is simply the logged-in user's own admin record. Source
 * the id from user.user.adminId and let the RQ cache own the entity.
 */
export function useSelectedAdmin(): {
  admin: Admin | null;
  adminId: string | null;
  isLoading: boolean;
} {
  const adminId = useAppSelector(s => s.user.user?.adminId ?? null);
  const { data, isLoading } = useAdmin(adminId ?? '', !!adminId);
  return {
    admin: data ?? null,
    adminId,
    isLoading,
  };
}
