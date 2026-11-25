/**
 * SubscriptionHandler Tests
 *
 * Covers (launch P5 Task 9): the screen links out to web billing in the
 * browser and never renders a WebView.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

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

const mockOpenWebBilling = jest.fn((_page: string) => Promise.resolve(true));
jest.mock('../../../services/webBilling', () => ({
  openWebBilling: (page: string) => mockOpenWebBilling(page),
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

  describe('link-out screen', () => {
    it('renders no WebView', () => {
      const { queryByTestId, UNSAFE_root } = renderScreen();
      expect(queryByTestId('subscription-webview')).toBeNull();
      // react-native-webview is mocked in jest.setup.js; nothing of it renders.
      const names = UNSAFE_root.findAll(() => true).map((n) =>
        typeof n.type === 'string' ? n.type : (n.type as { displayName?: string; name?: string }).displayName ?? (n.type as { name?: string }).name,
      );
      expect(names.some((n) => /webview/i.test(String(n)))).toBe(false);
    });

    it('explains that the plan opens in the browser', () => {
      const { getByTestId, getByText } = renderScreen();
      expect(getByTestId('subscription-link-out')).toBeTruthy();
      expect(getByText('Manage your plan on the web')).toBeTruthy();
    });

    it('opens my-account in the browser when Open is pressed', () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('subscription-link-out-open'));
      expect(mockOpenWebBilling).toHaveBeenCalledTimes(1);
      expect(mockOpenWebBilling).toHaveBeenCalledWith('my-account');
    });

    it('does not open anything until Open is pressed', () => {
      renderScreen();
      expect(mockOpenWebBilling).not.toHaveBeenCalled();
    });

    it('stays on the screen after opening the browser', () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('subscription-link-out-open'));
      expect(mockNavigation.goBack).not.toHaveBeenCalled();
      expect(mockNavigation.navigate).not.toHaveBeenCalled();
    });

    it('calls navigation.goBack when Go Back is pressed', () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId('subscription-link-out-go-back'));
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });
  });
});
