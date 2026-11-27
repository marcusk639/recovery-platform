import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAuthUser } from '../services/users';
import { watchClaimsUpdates } from '../services/claimsUpdates';
import { useAppDispatch } from '../state/store';
import { tokenRefreshed } from '../state/slices/userSlice';

/**
 * While an account is signed in, refreshes its ID token as soon as the server
 * changes its custom claims (src/services/claimsUpdates.ts), then refetches
 * every active query: what the rules let it read may have changed with its role.
 */
export function useClaimsUpdateRefresh(uid: string | undefined, enabled: boolean): void {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!uid || !enabled) return undefined;
    return watchClaimsUpdates(uid, {
      tokenIssuedAtMs: async () => {
        const issuedAt = (await getAuthUser(false))?.issuedAtTime;
        const ms = issuedAt ? Date.parse(issuedAt) : NaN;
        return Number.isFinite(ms) ? ms : undefined;
      },
      refresh: async () => {
        const token = await getAuthUser(true);
        if (token) dispatch(tokenRefreshed(token));
        await queryClient.invalidateQueries();
      },
    });
  }, [uid, enabled, dispatch, queryClient]);
}
