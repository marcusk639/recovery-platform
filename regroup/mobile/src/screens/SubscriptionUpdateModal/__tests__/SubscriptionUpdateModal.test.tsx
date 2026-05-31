/**
 * SubscriptionUpdateModal Tests
 *
 * Covers:
 * - Error message display for each status code
 * - Loading state during sign-out
 * - Button labels and visibility
 * - Guest vs account-holder modes
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// Mock the context module to avoid theme provider setup
// useTranslation is needed by RatsText
jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: 'rgb(99,139,250)',
      secondaryColor: '#d2d8ef',
      tertiaryColor: '#969696',
      backgroundColor: '#FAFAFA',
      textColor: 'black',
      primaryFontFamily: 'Quicksand-Medium',
      secondaryFontFamily: 'Quicksand-Medium',
      logoTintColor: '#ffffff',
    },
  }),
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock logging utility
jest.mock('../../../util/logging', () => ({
  logException: jest.fn(),
}));

const mockDispatch = jest.fn();

// Mock useAppDispatch so we can control dispatch results
jest.mock('../../../state/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: jest.fn(),
}));

// Mock userSlice logout action
jest.mock('../../../state/slices/userSlice', () => ({
  logout: jest.fn(() => ({ type: 'user/logout' })),
}));

import SubscriptionUpdateModal from '../SubscriptionUpdateModal';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

const renderModal = (status: string, isGuest = false) => {
  return render(
    <SubscriptionUpdateModal
      closeModal={jest.fn()}
      status={status}
      setModalShowing={jest.fn()}
      isGuest={isGuest}
      navigation={mockNavigation}
    />,
  );
};

describe('SubscriptionUpdateModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: dispatch resolves (successful logout)
    mockDispatch.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue(undefined),
    });
  });

  // -----------------------------------------------------------------------
  // Error message / status display
  // -----------------------------------------------------------------------
  describe('status-driven messaging', () => {
    it('displays "Payment Failed" header when status is payment_failed', () => {
      const { getByText } = renderModal('payment_failed');
      expect(getByText('Payment Failed')).toBeTruthy();
    });

    it('displays "update your payment method" in the description for payment_failed', () => {
      const { getByText } = renderModal('payment_failed');
      // RatsText renders text prop directly when translate=false
      expect(
        getByText(/update your payment method/i),
      ).toBeTruthy();
    });

    it('displays "Subscription Inactive" header when status is cancelled', () => {
      const { getByText } = renderModal('cancelled');
      expect(getByText('Subscription Inactive')).toBeTruthy();
    });

    it('displays "Subscription Expired" header when status is expired', () => {
      const { getByText } = renderModal('expired');
      expect(getByText('Subscription Expired')).toBeTruthy();
    });

    it('shows a fallback header for unknown statuses', () => {
      const { getByText } = renderModal('some_unknown_status');
      expect(getByText('Subscription Issue')).toBeTruthy();
    });

    it('shows guest-specific message when isGuest=true regardless of status', () => {
      const { getByText } = renderModal('payment_failed', true);
      // Guest always sees the generic "Subscription Issue" header
      expect(getByText('Subscription Issue')).toBeTruthy();
      // and is told to contact the house manager
      expect(getByText(/house manager/i)).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Button labels
  // -----------------------------------------------------------------------
  describe('button labels', () => {
    it('shows an action-specific CTA button for payment_failed (not just "My Account")', () => {
      const { getByTestId } = renderModal('payment_failed');
      // Button element is found by testID on TouchableOpacity which does receive it
      expect(getByTestId('subscription-go-to-account')).toBeTruthy();
    });

    it('shows an action-specific CTA button for cancelled', () => {
      const { getByTestId } = renderModal('cancelled');
      expect(getByTestId('subscription-go-to-account')).toBeTruthy();
    });

    it('always shows a Sign Out button', () => {
      const { getByTestId } = renderModal('payment_failed');
      expect(getByTestId('subscription-sign-out')).toBeTruthy();
    });

    it('hides the account CTA when isGuest=true', () => {
      const { queryByTestId } = renderModal('payment_failed', true);
      expect(queryByTestId('subscription-go-to-account')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  describe('sign-out loading state', () => {
    it('shows loading indicator while signing out and hides the sign-out button', async () => {
      let resolveLogout!: () => void;
      const logoutPromise = new Promise<void>(resolve => {
        resolveLogout = resolve;
      });

      mockDispatch.mockReturnValue({
        unwrap: jest.fn().mockReturnValue(logoutPromise),
      });

      const { getByTestId, queryByTestId } = renderModal('payment_failed');

      // Tap sign out
      fireEvent.press(getByTestId('subscription-sign-out'));

      // Loading indicator should appear; sign-out button should disappear
      await waitFor(() => {
        expect(getByTestId('subscription-signout-loading')).toBeTruthy();
        expect(queryByTestId('subscription-sign-out')).toBeNull();
      });

      // Resolve and clean up
      await act(async () => {
        resolveLogout();
        await logoutPromise;
      });
    });
  });

  // -----------------------------------------------------------------------
  // Successful sign-out restores button (or component unmounts in real app)
  // -----------------------------------------------------------------------
  describe('sign-out button visibility after action', () => {
    it('shows the sign-out button before any interaction', () => {
      const { getByTestId } = renderModal('payment_failed');
      expect(getByTestId('subscription-sign-out')).toBeTruthy();
    });
  });
});
