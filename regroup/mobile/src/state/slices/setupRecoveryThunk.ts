import { createAsyncThunk } from '@reduxjs/toolkit';
import { User } from '../../entities/User';
import { finishOperatorSetup, loadRecoveredUser } from '../../services/operator-setup';
import * as userService from '../../services/users';
import { logException } from '../../util/logging';

type RetryResult = { user: Partial<User>; token?: unknown };

/**
 * SetupRecoveryPanel's Retry: calls finishOperatorSetup again for the signed-in
 * operator. Rejects on `failed` or a missing uid (the panel stays up). On `completed` the token
 * is refreshed and the user reloaded (guarded as on login); on `incomplete`
 * the server found no owned house, so the wizard is the right place. Either
 * fulfilment clears userSlice.setupRecoveryFailed.
 */
export const retrySetupRecovery = createAsyncThunk<
  RetryResult,
  void,
  { state: { user: { user: Partial<User> | null } } }
>('user/retrySetupRecovery', async (_, { getState, rejectWithValue }) => {
  const current = getState().user.user ?? {};
  const uid = current.id ?? current.uid;
  // Without a uid nothing can be recovered or reloaded: never clear the flag.
  if (!uid) {
    return rejectWithValue('failed');
  }
  const outcome = await finishOperatorSetup(uid);
  if (outcome === 'failed') {
    return rejectWithValue('failed');
  }
  if (outcome === 'incomplete') {
    return { user: current };
  }
  const user = await loadRecoveredUser(current as User, {
    refreshToken: () => userService.getAuthUser(true),
    reloadUser: () => userService.getUser(uid),
  });
  let token: unknown;
  try {
    token = await userService.getAuthUser();
  } catch (error) {
    logException(error, 'retrySetupRecovery: reading the token failed');
  }
  return { user, token };
});
