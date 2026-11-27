/**
 * Pins where SubscriptionUpdateModal's account CTA ("Fix Subscription") goes:
 * the web /my-account page in the browser with ?from=app, through
 * services/webBilling.ts (launch P5 Task 9), so the web can hand back.
 *
 * Regression cover for a defect found 2026-10-02: this modal hardcoded
 * https://regroup-app.com/my-account and ignored RATS_WEB_URL, so a staging or
 * dev build sent a lapsed operator to the PRODUCTION billing page. The URL
 * cases below pin that on webBillingUrl, which the modal now uses.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { webBillingUrl } from '../../../services/webBilling';

const mockOpenWebBilling = jest.fn((_page: string) => Promise.resolve(true));
jest.mock('../../../services/webBilling', () => ({
  ...jest.requireActual('../../../services/webBilling'),
  openWebBilling: (page: string) => mockOpenWebBilling(page),
}));
const mockDispatch = jest.fn();
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


// Mock useAppDispatch so we can control dispatch results
jest.mock('../../../state/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: jest.fn(),
}));
jest.mock('../../../state/slices/userSlice', () => ({
  logout: jest.fn(() => ({ type: 'user/logout' })),
}));

import SubscriptionUpdateModal from '../SubscriptionUpdateModal';

describe('SubscriptionUpdateModal account URL', () => {
  const original = process.env.RATS_WEB_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.RATS_WEB_URL;
    else process.env.RATS_WEB_URL = original;
  });

  it('the account CTA opens my-account in the browser through openWebBilling', () => {
    const { getByTestId } = render(
      React.createElement(SubscriptionUpdateModal, {
        closeModal: jest.fn(),
        status: 'payment_failed',
        setModalShowing: jest.fn(),
        isGuest: false,
        navigation: { navigate: jest.fn(), goBack: jest.fn() } as any,
      }),
    );
    fireEvent.press(getByTestId('subscription-go-to-account'));
    expect(mockOpenWebBilling).toHaveBeenCalledWith('my-account');
  });

  it('defaults to the production origin plus the my-account path', () => {
    delete process.env.RATS_WEB_URL;
    expect(webBillingUrl('my-account')).toBe('https://regroup-app.com/my-account?from=app');
  });

  it('honours RATS_WEB_URL as a base rather than hardcoding production', () => {
    process.env.RATS_WEB_URL = 'https://staging.regroup-app.com';
    expect(webBillingUrl('my-account')).toBe('https://staging.regroup-app.com/my-account?from=app');
  });

  it('does not double the separator when the base has trailing slashes', () => {
    process.env.RATS_WEB_URL = 'https://staging.regroup-app.com///';
    expect(webBillingUrl('my-account')).toBe('https://staging.regroup-app.com/my-account?from=app');
  });

  it('never sends a non-production build to the production host', () => {
    process.env.RATS_WEB_URL = 'https://regroup-e2e.web.app';
    expect(new URL(webBillingUrl('my-account')).host).toBe('regroup-e2e.web.app');
  });

  it('always produces a path, never a bare origin', () => {
    for (const base of [undefined, 'https://regroup-app.com/', 'http://localhost:4200']) {
      if (base === undefined) delete process.env.RATS_WEB_URL;
      else process.env.RATS_WEB_URL = base;
      expect(new URL(webBillingUrl('my-account')).pathname).toBe('/my-account');
    }
  });
});
