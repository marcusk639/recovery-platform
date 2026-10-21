// useOrgSetupBlocker decides what OrgSetup renders instead of the wizard:
// the setup-recovery panel (finishOperatorSetup failed on login), or the
// plan-required panel (a fresh user-doc read fails the server's createHouses
// gate, or createHouses refused for no active plan).
const mockGetUser = jest.fn();
jest.mock('../../services/users', () => ({ getUser: (...a: unknown[]) => mockGetUser(...a) }));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));
let mockState: any;
const mockDispatch = jest.fn();
jest.mock('../../state/store', () => ({
  useAppSelector: (sel: (s: any) => unknown) => sel(mockState),
  useAppDispatch: () => mockDispatch,
}));
// useFocusEffect runs its callback on focus; tests fire a re-focus by calling
// the latest registered callback again.
let mockFocusCallback: (() => void) | undefined;
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (cb: () => void) => {
      mockFocusCallback = cb;
      useEffect(() => cb(), [cb]);
    },
  };
});
jest.mock('../../state/slices/setupSlice', () => ({
  resetSubmissionState: () => ({ type: 'setup/resetSubmissionState' }),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { logException } from '../../util/logging';
import { useOrgSetupBlocker } from '../useOrgSetupBlocker';

const state = (over: { recovery?: boolean; errorKind?: string | null } = {}) => ({
  user: { user: { id: 'op' }, setupRecoveryFailed: over.recovery ?? false },
  setup: { errorKind: over.errorKind ?? null },
});
const active = { subscriptionMetadata: { tier: 'starter', status: 'active' } };
const lapsed = { subscriptionMetadata: { tier: 'starter', status: 'canceled' } };

beforeEach(() => {
  mockState = state();
  mockGetUser.mockResolvedValue(active);
});

describe('useOrgSetupBlocker', () => {
  it('is null for an entitled operator (fresh read)', async () => {
    const { result } = renderHook(() => useOrgSetupBlocker());
    await waitFor(() => expect(mockGetUser).toHaveBeenCalledWith('op'));
    expect(result.current.kind).toBeNull();
  });

  it('blocks with setup-recovery while setupRecoveryFailed is set, without a plan read', () => {
    mockState = state({ recovery: true });
    const { result } = renderHook(() => useOrgSetupBlocker());
    expect(result.current.kind).toBe('setup-recovery');
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('blocks with plan-required when the fresh user doc fails the gate', async () => {
    mockGetUser.mockResolvedValue(lapsed);
    const { result } = renderHook(() => useOrgSetupBlocker());
    await waitFor(() => expect(result.current.kind).toBe('plan-required'));
  });

  it('does not block when the plan read fails (the server gate still applies)', async () => {
    mockGetUser.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useOrgSetupBlocker());
    await waitFor(() => expect(logException).toHaveBeenCalled());
    expect(result.current.kind).toBeNull();
  });

  it('blocks with plan-required on the createHouses subscription refusal (backstop)', async () => {
    mockState = state({ errorKind: 'subscription-required' });
    const { result } = renderHook(() => useOrgSetupBlocker());
    expect(result.current.kind).toBe('plan-required');
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());
  });

  it('checkAgain clears the submission error and re-reads the plan', async () => {
    mockGetUser.mockResolvedValueOnce(lapsed).mockResolvedValueOnce(active);
    const { result } = renderHook(() => useOrgSetupBlocker());
    await waitFor(() => expect(result.current.kind).toBe('plan-required'));

    await act(async () => {
      await result.current.checkAgain();
    });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'setup/resetSubmissionState' });
    expect(mockGetUser).toHaveBeenCalledTimes(2);
    expect(result.current.kind).toBeNull();
  });

  it('re-reads the plan when the screen regains focus (operator subscribed and came back)', async () => {
    mockGetUser.mockResolvedValueOnce(lapsed).mockResolvedValueOnce(active);
    const { result } = renderHook(() => useOrgSetupBlocker());
    await waitFor(() => expect(result.current.kind).toBe('plan-required'));

    await act(async () => {
      mockFocusCallback?.();
    });
    await waitFor(() => expect(result.current.kind).toBeNull());
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });
});
