/**
 * Pins where SubscriptionRequiredScreen's "Manage Subscription" goes: the web
 * /my-account page (the Stripe billing portal), in the browser, through
 * services/webBilling.ts (launch P5 Task 9).
 *
 * Regression cover for two defects found 2026-09-28: the old /billing default
 * opened a 404, and RATS_WEB_URL read as a complete url dropped the path. The
 * URL cases below pin both on webBillingUrl, which the screen now uses.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { webBillingUrl } from '../../../services/webBilling';

const mockOpenWebBilling = jest.fn((_page: string) => Promise.resolve(true));
jest.mock('../../../services/webBilling', () => ({
  ...jest.requireActual('../../../services/webBilling'),
  openWebBilling: (page: string) => mockOpenWebBilling(page),
}));
jest.mock('../../../state/store', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (select: (s: unknown) => unknown) => select({ user: { user: null } }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('../../../components/rats-logo/rats-logo', () => ({ RatsLogo: () => null }));

describe('SubscriptionRequiredScreen web portal URL', () => {
  const original = process.env.RATS_WEB_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.RATS_WEB_URL;
    } else {
      process.env.RATS_WEB_URL = original;
    }
  });

  it('Manage Subscription opens my-account in the browser', () => {
    const Screen = require('../SubscriptionRequiredScreen').default;
    const { getByTestId } = render(React.createElement(Screen));
    fireEvent.press(getByTestId('btn-manage-subscription'));
    expect(mockOpenWebBilling).toHaveBeenCalledWith('my-account');
  });

  it('treats RATS_WEB_URL as a base and appends the page', () => {
    process.env.RATS_WEB_URL = 'https://staging.regroup-app.com';
    expect(webBillingUrl('my-account')).toBe('https://staging.regroup-app.com/my-account?from=app');
  });

  it('does not double the separator when the base has trailing slashes', () => {
    process.env.RATS_WEB_URL = 'https://staging.regroup-app.com///';
    expect(webBillingUrl('my-account')).toBe('https://staging.regroup-app.com/my-account?from=app');
  });

  it('always produces a path, never a bare origin', () => {
    for (const base of [undefined, 'https://regroup-app.com', 'https://regroup-app.com/', 'http://localhost:4200']) {
      if (base === undefined) delete process.env.RATS_WEB_URL;
      else process.env.RATS_WEB_URL = base;
      expect(new URL(webBillingUrl('my-account')).pathname).toBe('/my-account');
    }
  });

  it('supports a local emulator base', () => {
    process.env.RATS_WEB_URL = 'http://localhost:4200';
    expect(webBillingUrl('my-account')).toBe('http://localhost:4200/my-account?from=app');
  });
});
