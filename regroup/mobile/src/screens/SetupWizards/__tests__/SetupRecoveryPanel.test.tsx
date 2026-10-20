// SetupRecoveryPanel replaces the OrgSetup wizard while setupRecoveryFailed is
// set. Retry re-runs finishOperatorSetup; a completed recovery goes to the
// main app, a failed one keeps the panel and says so. Sign out logs out.
const mockDispatch = jest.fn();
jest.mock('../../../state/store', () => ({ useAppDispatch: () => mockDispatch }));
jest.mock('../../../state/slices/setupRecoveryThunk', () => ({
  retrySetupRecovery: jest.fn(() => ({ type: 'user/retrySetupRecovery' })),
}));
jest.mock('../../../state/slices/userSlice', () => ({
  logout: jest.fn(() => ({ type: 'user/logout' })),
}));
jest.mock('../../../navigation/authNavigation', () => ({ navigateToMainTab: jest.fn() }));

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { navigateToMainTab } from '../../../navigation/authNavigation';
import { Routes } from '../../../navigation/types';
import { retrySetupRecovery } from '../../../state/slices/setupRecoveryThunk';
import { logout } from '../../../state/slices/userSlice';
import SetupRecoveryPanel, { RETRY_FAILED_MESSAGE } from '../SetupRecoveryPanel';

const navigation = { navigate: jest.fn() } as any;
const dispatchResolving = (unwrap: () => Promise<unknown>) =>
  mockDispatch.mockImplementation((action: { type: string }) =>
    action.type === 'user/retrySetupRecovery' ? { unwrap } : action,
  );

describe('SetupRecoveryPanel', () => {
  it('shows the finishing-setup message and no Complete Setup button', () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <SetupRecoveryPanel navigation={navigation} />,
    );
    expect(getByTestId('setup-recovery-panel')).toBeTruthy();
    expect(getByText(/finishing setting up your houses/)).toBeTruthy();
    expect(queryByTestId('complete-setup-button')).toBeNull();
  });

  it('Retry success navigates to the main app', async () => {
    dispatchResolving(async () => ({ user: { orgSetupCompleted: true } }));
    const { getByTestId, queryByText } = render(<SetupRecoveryPanel navigation={navigation} />);

    fireEvent.press(getByTestId('setup-recovery-retry'));
    await waitFor(() => expect(navigateToMainTab).toHaveBeenCalledWith(navigation, Routes.House));
    expect(retrySetupRecovery).toHaveBeenCalled();
    expect(queryByText(RETRY_FAILED_MESSAGE)).toBeNull();
  });

  it('Retry that leaves setup incomplete does not navigate (OrgSetup shows the wizard)', async () => {
    dispatchResolving(async () => ({ user: { orgSetupCompleted: false } }));
    const { getByTestId } = render(<SetupRecoveryPanel navigation={navigation} />);

    fireEvent.press(getByTestId('setup-recovery-retry'));
    await waitFor(() => expect(retrySetupRecovery).toHaveBeenCalled());
    expect(navigateToMainTab).not.toHaveBeenCalled();
  });

  it('Retry failure keeps the panel and shows an error', async () => {
    dispatchResolving(async () => Promise.reject('failed'));
    const { getByTestId, findByText } = render(<SetupRecoveryPanel navigation={navigation} />);

    fireEvent.press(getByTestId('setup-recovery-retry'));
    expect(await findByText(RETRY_FAILED_MESSAGE)).toBeTruthy();
    expect(getByTestId('setup-recovery-panel')).toBeTruthy();
    expect(navigateToMainTab).not.toHaveBeenCalled();
  });

  it('Sign out dispatches logout', () => {
    mockDispatch.mockImplementation((a: unknown) => a);
    const { getByTestId } = render(<SetupRecoveryPanel navigation={navigation} />);
    fireEvent.press(getByTestId('setup-panel-sign-out'));
    expect(logout).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'user/logout' });
  });
});
