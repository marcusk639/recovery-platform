/**
 * SubscriptionGate renders the gate's verdict. A resident of a blocked house
 * gets the limited view (their own payment history and documents); an
 * operator of one still gets the plan-required screen; nobody blocked gets the
 * app's tabs.
 */
let mockResult: { status: string; endsAt?: Date } = { status: 'allowed' };
jest.mock('../../../hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => mockResult,
}));

jest.mock('../../../state/store', () => ({
  useAppSelector: (select: (s: unknown) => unknown) =>
    select({ user: { user: { id: 'u1', houseId: 'house-1' } } }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('../ResidentLimitedView', () => {
  const { Text } = require('react-native');
  return () => <Text testID="resident-limited-view">limited</Text>;
});
jest.mock('../../../screens/Subscription/SubscriptionRequiredScreen', () => {
  const { Text } = require('react-native');
  return () => <Text testID="subscription-required-screen">plan required</Text>;
});
jest.mock('../GracePeriodBanner', () => {
  const { Text } = require('react-native');
  return () => <Text testID="grace-banner">grace</Text>;
});

import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import SubscriptionGate from '../SubscriptionGate';

const renderGate = () =>
  render(
    <SubscriptionGate>
      <Text testID="house-tab">tabs</Text>
    </SubscriptionGate>,
  );

describe('SubscriptionGate', () => {
  it('shows a resident of a blocked house the limited view, not the tabs', () => {
    mockResult = { status: 'grace_expired' };
    const screen = renderGate();
    expect(screen.getByTestId('resident-limited-view')).toBeTruthy();
    expect(screen.queryByTestId('house-tab')).toBeNull();
  });

  it('still shows an operator of a blocked house the plan-required screen', () => {
    mockResult = { status: 'subscription_required' };
    const screen = renderGate();
    expect(screen.getByTestId('subscription-required-screen')).toBeTruthy();
    expect(screen.queryByTestId('resident-limited-view')).toBeNull();
    expect(screen.queryByTestId('house-tab')).toBeNull();
  });

  it('shows the app during grace, with the banner', () => {
    mockResult = { status: 'grace_period', endsAt: new Date('2026-12-01') };
    const screen = renderGate();
    expect(screen.getByTestId('grace-banner')).toBeTruthy();
    expect(screen.getByTestId('house-tab')).toBeTruthy();
  });

  it('shows the app when allowed', () => {
    mockResult = { status: 'allowed' };
    expect(renderGate().getByTestId('house-tab')).toBeTruthy();
  });

  it('shows neither the app nor a block while loading', () => {
    mockResult = { status: 'loading' };
    const screen = renderGate();
    expect(screen.queryByTestId('house-tab')).toBeNull();
    expect(screen.queryByTestId('resident-limited-view')).toBeNull();
  });
});
