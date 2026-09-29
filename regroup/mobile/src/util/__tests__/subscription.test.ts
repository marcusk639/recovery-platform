// src/util/__tests__/subscription.test.ts
//
// Unit tests for subscription.ts.
// subscription.ts imports from display.tsx which has transitive React Native deps,
// so we replicate the same mocks used in display.test.ts.

jest.mock('react-native', () => ({
  StyleSheet: { create: (s: any) => s },
  Platform: { OS: 'ios' },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  View: 'View',
  TouchableOpacity: 'TouchableOpacity',
  Text: 'Text',
}));

jest.mock('react-native-size-matters', () => ({
  moderateScale: (n: number) => n,
}));

jest.mock('@callstack/react-theme-provider', () => ({
  createTheming: () => ({
    ThemeProvider: 'ThemeProvider',
    withTheme: (c: any) => c,
    useTheme: jest.fn(),
  }),
}));

jest.mock('../../styles/theme', () => ({
  color: {},
  fontSize: {},
  fontFamily: {},
  normalize: (n: number) => n,
}));

jest.mock('../../components/weekdays', () => ({
  daysOfWeek: [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ],
  Weekdays: 'Weekdays',
}));

jest.mock('../../screens/StatUpdates/MeetingSearch', () => ({
  WeekDay: undefined,
  MEETING_DESCRIPTION_TEXT: {},
}));

jest.mock('../../util/platform', () => ({
  IOS: true,
}));

import { subscriptionStatus, subscriptionIsActive } from '../subscription';
import { User, OperatorSubscription } from '../../entities/User';

// Helper: build a minimal User with subscription metadata
function makeUser(overrides: Partial<OperatorSubscription> = {}): User {
  const user = new User('uid-test');
  const meta = new OperatorSubscription();
  Object.assign(meta, overrides);
  user.subscriptionMetadata = meta;
  return user;
}

// ─── subscriptionStatus ──────────────────────────────────────────────────────

describe('subscriptionStatus', () => {
  it('returns the status string directly when status field is set', () => {
    const user = makeUser({ status: 'active' });
    expect(subscriptionStatus(user)).toBe('active');
  });

  it('returns "trialing" when status is "trialing"', () => {
    const user = makeUser({ status: 'trialing' });
    expect(subscriptionStatus(user)).toBe('trialing');
  });

  it('returns "past_due" when status is "past_due"', () => {
    const user = makeUser({ status: 'past_due' });
    expect(subscriptionStatus(user)).toBe('past_due');
  });

  it('returns "canceled" when status is "canceled"', () => {
    const user = makeUser({ status: 'canceled' });
    expect(subscriptionStatus(user)).toBe('canceled');
  });

  it('returns "expired" when status is falsy and currentPeriodEnd is in the past', () => {
    // currentPeriodEnd is a Unix timestamp in the past
    // dayIsAfter(today, pastDate) → true → "expired"
    const pastTimestamp = new Date('2020-01-01').getTime();
    const user = makeUser({ status: '', currentPeriodEnd: pastTimestamp });
    expect(subscriptionStatus(user)).toBe('expired');
  });

  it('returns undefined when subscriptionMetadata is falsy', () => {
    const user = new User('uid-no-meta');
    // Override with null to test the guard branch
    (user as any).subscriptionMetadata = null;
    expect(subscriptionStatus(user)).toBeUndefined();
  });

  it('returns undefined when status is empty and currentPeriodEnd is in the future', () => {
    // dayIsAfter(today, futureDate) → false → falls through without returning
    const futureTimestamp = new Date('2099-12-31').getTime();
    const user = makeUser({ status: '', currentPeriodEnd: futureTimestamp });
    expect(subscriptionStatus(user)).toBeUndefined();
  });
});

// ─── subscriptionIsActive ────────────────────────────────────────────────────

describe('subscriptionIsActive', () => {
  it('returns true when subscription status is "active"', () => {
    const user = makeUser({ status: 'active' });
    expect(subscriptionIsActive(user)).toBe(true);
  });

  it('returns false when subscription status is "canceled"', () => {
    const user = makeUser({ status: 'canceled' });
    expect(subscriptionIsActive(user)).toBe(false);
  });

  it('returns true when subscription status is "trialing"', () => {
    const user = makeUser({ status: 'trialing' });
    expect(subscriptionIsActive(user)).toBe(true);
  });

  it('returns false when subscription is expired', () => {
    const pastTimestamp = new Date('2020-01-01').getTime();
    const user = makeUser({ status: '', currentPeriodEnd: pastTimestamp });
    expect(subscriptionIsActive(user)).toBe(false);
  });

  it('returns false when subscriptionMetadata is missing', () => {
    const user = new User('uid-empty');
    (user as any).subscriptionMetadata = null;
    expect(subscriptionIsActive(user)).toBe(false);
  });

  it('treats a tier subscription with no legacy fields as active', () => {
    const user = {
      subscriptionMetadata: {
        status: 'active',
        subscriptionId: 'sub_1',
        customerId: 'cus_1',
        houseType: 'oxford',
        tier: 'standard',
        oxfordEnabled: true,
        maxResidents: 15,
        maxProperties: 1,
      },
    } as unknown as User;

    expect(subscriptionIsActive(user)).toBe(true);
  });
});
