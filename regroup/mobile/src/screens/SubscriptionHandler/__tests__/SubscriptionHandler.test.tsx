/**
 * SubscriptionHandler Tests
 *
 * Covers:
 * - Loading state rendering via WebView
 * - Error state when WebView fails to load
 * - Retry and go-back buttons in error state
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock context
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

jest.mock('../../../state/store', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: jest.fn(),
}));

import SubscriptionHandler from '../SubscriptionHandler';
import { User } from '../../../entities/User';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as any;

const mockRoute = { key: 'subscriptionHandler', name: 'subscriptionHandler', params: undefined } as any;

const mockUser = new User('user123');
mockUser.email = 'test@test.com';
mockUser.firstName = 'Test';

const renderScreen = () =>
  render(
    <SubscriptionHandler
      navigation={mockNavigation}
      route={mockRoute}
      user={mockUser}
    />,
  );

describe('SubscriptionHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Normal rendering
  // -----------------------------------------------------------------------
  describe('normal rendering', () => {
    it('renders the WebView element', () => {
      const { getByTestId } = renderScreen();
      // react-native-webview is mocked as a View in jest.setup.js
      expect(getByTestId('subscription-webview')).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------
  describe('error state', () => {
    it('shows error UI when WebView triggers onError', async () => {
      const { getByTestId } = renderScreen();
      const webView = getByTestId('subscription-webview');

      // Trigger error event
      fireEvent(webView, 'error', { nativeEvent: { description: 'net::ERR_NAME_NOT_RESOLVED' } });

      await waitFor(() => {
        expect(getByTestId('subscription-webview-error')).toBeTruthy();
      });
    });

    it('shows a retry button in error state', async () => {
      const { getByTestId } = renderScreen();

      fireEvent(getByTestId('subscription-webview'), 'error', {
        nativeEvent: { description: 'failed' },
      });

      await waitFor(() => {
        expect(getByTestId('subscription-webview-retry')).toBeTruthy();
      });
    });

    it('shows a go-back button in error state', async () => {
      const { getByTestId } = renderScreen();

      fireEvent(getByTestId('subscription-webview'), 'error', {
        nativeEvent: { description: 'failed' },
      });

      await waitFor(() => {
        expect(getByTestId('subscription-webview-go-back')).toBeTruthy();
      });
    });

    it('calls navigation.goBack when the go-back button is pressed', async () => {
      const { getByTestId } = renderScreen();

      fireEvent(getByTestId('subscription-webview'), 'error', {
        nativeEvent: { description: 'failed' },
      });

      await waitFor(() => {
        expect(getByTestId('subscription-webview-go-back')).toBeTruthy();
      });

      fireEvent.press(getByTestId('subscription-webview-go-back'));
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('clears error state and returns to WebView when retry is pressed', async () => {
      const { getByTestId, queryByTestId } = renderScreen();

      // Trigger error
      fireEvent(getByTestId('subscription-webview'), 'error', {
        nativeEvent: { description: 'failed' },
      });

      await waitFor(() => {
        expect(getByTestId('subscription-webview-error')).toBeTruthy();
      });

      // Press retry
      fireEvent.press(getByTestId('subscription-webview-retry'));

      await waitFor(() => {
        expect(queryByTestId('subscription-webview-error')).toBeNull();
        expect(getByTestId('subscription-webview')).toBeTruthy();
      });
    });
  });
});
