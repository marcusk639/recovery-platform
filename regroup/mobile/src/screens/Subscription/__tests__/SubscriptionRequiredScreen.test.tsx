/**
 * SubscriptionRequiredScreen: what a lapsed operator sees instead of the app.
 * SubscriptionGate replaces the whole tab navigator, so this screen is the only
 * way to the account's own settings while the plan is lapsed. App Store
 * 5.1.1(v): account deletion must stay reachable, so the screen opens the
 * existing Delete account screen (the same password check and the same
 * deleteAccount callable as Personal > Delete account).
 */
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockDispatch = jest.fn();
jest.mock('../../../state/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (select: (s: unknown) => unknown) =>
    select({ user: { user: { id: 'operator-uid', houseId: 'house-1' } } }),
}));

const mockLogout = jest.fn(() => ({ type: 'user/logout' }));
jest.mock('../../../state/slices/userSlice', () => ({
  logout: () => mockLogout(),
}));

const mockInvalidate = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

const mockOpenWebBilling = jest.fn();
jest.mock('../../../services/webBilling', () => ({
  openWebBilling: (...a: unknown[]) => mockOpenWebBilling(...a),
}));

jest.mock('../../../components/rats-logo/rats-logo', () => ({
  RatsLogo: () => null,
}));

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import SubscriptionRequiredScreen from '../SubscriptionRequiredScreen';
import { Routes } from '../../../navigation/types';

beforeEach(() => jest.clearAllMocks());

describe('SubscriptionRequiredScreen', () => {
  it('opens the existing Delete account screen', () => {
    const screen = render(<SubscriptionRequiredScreen />);
    fireEvent.press(screen.getByTestId('btn-delete-account'));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(Routes.DeleteAccount);
  });

  it('labels the deletion link plainly', () => {
    const screen = render(<SubscriptionRequiredScreen />);
    expect(screen.getByText('Delete account')).toBeTruthy();
  });

  it('still offers Manage Subscription, I\'ve Subscribed and Sign out', () => {
    const screen = render(<SubscriptionRequiredScreen />);
    fireEvent.press(screen.getByTestId('btn-manage-subscription'));
    expect(mockOpenWebBilling).toHaveBeenCalledWith('my-account');
    fireEvent.press(screen.getByTestId('btn-refresh-subscription'));
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['user', 'operator-uid'] });
    fireEvent.press(screen.getByTestId('btn-sign-out'));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'user/logout' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
