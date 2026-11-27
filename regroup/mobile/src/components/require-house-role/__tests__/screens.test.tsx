/**
 * P5 Task 20: every operator-only screen checks the role itself. Each
 * registered screen is rendered as a resident (no access), and the money
 * screens as a peer leader (no access). The route list is pinned, so dropping
 * a screen's guard fails here.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Routes } from '../../../navigation/types';

let mockRole: Record<string, string> = {};
jest.mock('../../../context/auth', () => ({
  useRoleToken: () => ({ claims: {}, role: mockRole }),
}));

let mockMoneyAccess: 'yes' | 'no' | 'checking' = 'yes';
jest.mock('../../../state/queries/houseTierQueries', () => ({
  useHouseMoneyAccess: () => mockMoneyAccess,
}));

jest.mock('../../../state/store', () => ({
  useAppSelector: (select: (s: unknown) => unknown) =>
    select({ houses: { selectedHouseId: 'house-1' } }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
}));

jest.mock('../../screen-header', () => {
  const { Text } = require('react-native');
  return ({ header }: { header: string }) => <Text>{header}</Text>;
});

import { guardedScreens, GUARDED_ROUTE_RANKS } from '../../../navigation/guardedScreens';

const ADMIN_SCREENS = [
  Routes.DrugTesting,
  Routes.DrugTestForm,
  Routes.DrugTestHistory,
  Routes.ResidentIntake,
  Routes.ApplicationList,
  Routes.ApplicationDetail,
  Routes.HouseSettings,
  Routes.StaffNotes,
  // House Settings → Rent: peer leaders get its read-only view.
  Routes.RentSettings,
];
// Guest Import: bulk-adding residents is for owners and managers (owner,
// 2026-11-27), the same tiers as the house's money.
const MONEY_SCREENS = [
  Routes.GuestImport,
  Routes.BalanceDashboard,
  Routes.PaymentDashboard,
  Routes.StripeSettings,
  Routes.AdminReport,
  // A resident's balance: owners and managers correct it.
  Routes.GuestBalance,
];
// Stripe Connect setup is the owner's (OPS-042): the Connect callables accept
// only the house's owners, so a manager is refused it too.
const OWNER_SCREENS = [Routes.StripeSettings];

const renderRoute = (route: string, params: Record<string, string> = {}) => {
  const Screen = guardedScreens[route];
  return render(
    <Screen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params }} />,
  );
};

describe('operator-only screens check the role themselves', () => {
  beforeEach(() => {
    mockRole = {};
    mockMoneyAccess = 'yes';
  });

  it('guards exactly the operator-only routes, the money ones at manager rank', () => {
    expect(GUARDED_ROUTE_RANKS).toEqual({
      ...Object.fromEntries(ADMIN_SCREENS.map((r) => [r, 'admin'])),
      ...Object.fromEntries(MONEY_SCREENS.map((r) => [r, 'manager'])),
      ...Object.fromEntries(OWNER_SCREENS.map((r) => [r, 'owner'])),
    });
  });

  it.each(OWNER_SCREENS)('%s refuses a manager', (route) => {
    mockRole = { 'house-1': 'admin' };
    mockMoneyAccess = 'yes';
    const { getByTestId } = renderRoute(route);
    expect(getByTestId('no-access-screen')).toBeTruthy();
  });

  it.each([...ADMIN_SCREENS, ...MONEY_SCREENS])('%s refuses a resident', (route) => {
    mockRole = { 'house-1': 'guest' };
    const { getByTestId } = renderRoute(route);
    expect(getByTestId('no-access-screen')).toBeTruthy();
  });

  it.each([...ADMIN_SCREENS, ...MONEY_SCREENS])(
    '%s refuses someone with no role in the house',
    (route) => {
      mockRole = { 'house-2': 'superAdmin' };
      const { getByTestId } = renderRoute(route);
      expect(getByTestId('no-access-screen')).toBeTruthy();
    },
  );

  it.each(MONEY_SCREENS)('%s refuses a peer leader', (route) => {
    mockRole = { 'house-1': 'admin' };
    mockMoneyAccess = 'no';
    const { getByTestId } = renderRoute(route);
    expect(getByTestId('no-access-screen')).toBeTruthy();
  });

  it.each(MONEY_SCREENS.filter((r) => !OWNER_SCREENS.includes(r)))(
    '%s waits for the tier, showing nothing of the screen',
    (route) => {
    mockRole = { 'house-1': 'admin' };
    mockMoneyAccess = 'checking';
    const { getByTestId, queryByTestId } = renderRoute(route);
    expect(getByTestId('role-check-pending')).toBeTruthy();
    expect(queryByTestId('no-access-screen')).toBeNull();
    },
  );

  it('checks the house a route names, not the selected one', () => {
    // An admin of the selected house opening another house's application.
    mockRole = { 'house-1': 'superAdmin', 'house-2': 'guest' };
    const { getByTestId } = renderRoute(Routes.ApplicationDetail, {
      houseId: 'house-2',
      appId: 'a1',
    });
    expect(getByTestId('no-access-screen')).toBeTruthy();
  });
});
