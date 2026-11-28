/**
 * ResidentLimitedView: what a resident of a blocked house (plan required, or
 * lapsed past grace) sees instead of the app (launch spec §4.1 item 2). They
 * keep their own payment history and their own documents, and nothing else.
 */
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockDispatch = jest.fn();
let mockUser: { id: string } | null = { id: 'resident-uid' };
jest.mock('../../../state/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (select: (s: unknown) => unknown) => select({ user: { user: mockUser } }),
}));

const mockLogout = jest.fn(() => ({ type: 'user/logout' }));
jest.mock('../../../state/slices/userSlice', () => ({
  logout: () => mockLogout(),
}));

let mockHouse: Record<string, unknown> | null = { id: 'house-1', phoneNumber: '555-0100' };
jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => ({ house: mockHouse, isLoading: false }),
}));

let mockGuest: Record<string, unknown> | null = { id: 'guest-1', userId: 'resident-uid' };
jest.mock('../../../hooks/useSelectedGuest', () => ({
  useSelectedGuest: () => ({ guest: mockGuest, guestId: mockGuest?.id ?? null, isLoading: false }),
}));

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ResidentLimitedView from '../ResidentLimitedView';
import { Routes } from '../../../navigation/types';

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'resident-uid' };
  mockHouse = { id: 'house-1', phoneNumber: '555-0100' };
  mockGuest = { id: 'guest-1', userId: 'resident-uid' };
});

describe('ResidentLimitedView', () => {
  it('says the house is blocked, with the house phone', () => {
    const screen = render(<ResidentLimitedView />);
    expect(screen.getByTestId('resident-limited-view')).toBeTruthy();
    expect(screen.getByText('Access temporarily unavailable')).toBeTruthy();
    expect(screen.getByText('555-0100')).toBeTruthy();
  });

  it('opens their payment history', () => {
    const screen = render(<ResidentLimitedView />);
    fireEvent.press(screen.getByTestId('limited-payment-history'));
    expect(mockNavigate).toHaveBeenCalledWith(Routes.PaymentHistory);
  });

  it('opens their own documents, by their own guest record', () => {
    const screen = render(<ResidentLimitedView />);
    fireEvent.press(screen.getByTestId('limited-documents'));
    expect(mockNavigate).toHaveBeenCalledWith(Routes.Documents, {
      houseId: 'house-1',
      guestId: 'guest-1',
      title: 'My Documents',
    });
  });

  it("offers no documents when the selected record isn't their own", () => {
    mockGuest = { id: 'guest-2', userId: 'someone-else' };
    const screen = render(<ResidentLimitedView />);
    expect(screen.queryByTestId('limited-documents')).toBeNull();
    expect(screen.queryByTestId('limited-payment-history')).toBeNull();
  });

  it('offers no documents before their record loads', () => {
    mockGuest = null;
    const screen = render(<ResidentLimitedView />);
    expect(screen.queryByTestId('limited-documents')).toBeNull();
  });

  // App Store 5.1.1(v): this view replaces the tabs, so it is the only way to
  // the existing Delete account screen (Personal is out of reach).
  it('opens the existing Delete account screen, with or without their record', () => {
    mockGuest = null;
    const screen = render(<ResidentLimitedView />);
    fireEvent.press(screen.getByTestId('limited-delete-account'));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(Routes.DeleteAccount);
  });

  it('signs out', () => {
    const screen = render(<ResidentLimitedView />);
    fireEvent.press(screen.getByTestId('limited-sign-out'));
    expect(mockLogout).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'user/logout' });
  });
});
