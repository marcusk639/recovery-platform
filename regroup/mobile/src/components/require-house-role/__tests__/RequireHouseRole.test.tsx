import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import RequireHouseRole from '../RequireHouseRole';
import { withHouseRole } from '../withHouseRole';

let mockToken: { claims?: object; role?: Record<string, string> } = {};
jest.mock('../../../context/auth', () => ({
  useRoleToken: () => mockToken,
}));

const mockUseHouseMoneyAccess = jest.fn();
jest.mock('../../../state/queries/houseTierQueries', () => ({
  useHouseMoneyAccess: (...args: unknown[]) => mockUseHouseMoneyAccess(...args),
}));

let mockSelectedHouseId: string | null = 'h1';
jest.mock('../../../state/store', () => ({
  useAppSelector: (select: (s: unknown) => unknown) =>
    select({ houses: { selectedHouseId: mockSelectedHouseId } }),
}));

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('../../screen-header', () => {
  const { Text: T } = require('react-native');
  return ({ header, renderBackButton }: { header: string; renderBackButton?: boolean }) => (
    <T testID={renderBackButton ? 'header-with-back' : 'header'}>{header}</T>
  );
});

const renderGuard = (minRank: 'admin' | 'manager' | 'owner', houseId: string | null = 'h1') =>
  render(
    <RequireHouseRole houseId={houseId} minRank={minRank}>
      <Text testID="the-screen">screen</Text>
    </RequireHouseRole>,
  );

describe('RequireHouseRole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseHouseMoneyAccess.mockReturnValue('no');
  });

  it('shows the screen to house staff at admin rank', () => {
    mockToken = { claims: {}, role: { h1: 'admin' } };
    expect(renderGuard('admin').getByTestId('the-screen')).toBeTruthy();
  });

  it('shows a money screen to the owner without asking for the tier', () => {
    mockToken = { claims: {}, role: { h1: 'superAdmin' } };
    expect(renderGuard('manager').getByTestId('the-screen')).toBeTruthy();
    expect(mockUseHouseMoneyAccess).toHaveBeenCalledWith('h1', false);
  });

  it('shows a money screen to a manager once the tier says so', () => {
    mockToken = { claims: {}, role: { h1: 'admin' } };
    mockUseHouseMoneyAccess.mockReturnValue('yes');
    expect(renderGuard('manager').getByTestId('the-screen')).toBeTruthy();
    expect(mockUseHouseMoneyAccess).toHaveBeenCalledWith('h1', true);
  });

  it('shows an owner-rank screen to the owner, without asking for the tier', () => {
    mockToken = { claims: {}, role: { h1: 'superAdmin' } };
    expect(renderGuard('owner').getByTestId('the-screen')).toBeTruthy();
    expect(mockUseHouseMoneyAccess).toHaveBeenCalledWith('h1', false);
  });

  it('refuses an owner-rank screen to a manager', () => {
    mockToken = { claims: {}, role: { h1: 'admin' } };
    mockUseHouseMoneyAccess.mockReturnValue('yes');
    expect(renderGuard('owner').getByTestId('no-access-screen')).toBeTruthy();
  });

  it('refuses a resident, with a way back', () => {
    mockToken = { claims: {}, role: { h1: 'guest' } };
    const { getByTestId, queryByTestId, getByText } = renderGuard('admin');
    expect(queryByTestId('the-screen')).toBeNull();
    expect(getByText("You don't have access to this")).toBeTruthy();
    fireEvent.press(getByTestId('no-access-back-button'));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('refuses when there is no house to check', () => {
    mockToken = { claims: {}, role: { h1: 'superAdmin' } };
    expect(renderGuard('admin', null).getByTestId('no-access-screen')).toBeTruthy();
  });

  it('waits, showing nothing, until the claims are known', () => {
    mockToken = { role: undefined };
    const { getByTestId, queryByTestId } = renderGuard('admin');
    expect(getByTestId('role-check-pending')).toBeTruthy();
    expect(queryByTestId('the-screen')).toBeNull();
    // ...with a back button, so a check that never settles is not a dead end.
    expect(getByTestId('header-with-back')).toBeTruthy();
  });
});

// The wrapper guardedScreens.ts registers each screen with: it must hand the
// guard the house the screen works on, or every screen would be refused (or
// opened) for the wrong house.
describe('withHouseRole', () => {
  const Screen: React.FC<{ route?: { params?: { houseId?: string } } }> = () => (
    <Text testID="the-screen">screen</Text>
  );
  const Guarded = withHouseRole(Screen, 'admin');

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseHouseMoneyAccess.mockReturnValue('no');
    mockSelectedHouseId = 'h1';
  });

  it('opens the screen for staff of the selected house when the route names none', () => {
    mockToken = { claims: {}, role: { h1: 'admin' } };
    expect(render(<Guarded />).getByTestId('the-screen')).toBeTruthy();
  });

  it("checks the route's house over the selected one", () => {
    mockToken = { claims: {}, role: { h1: 'guest', h2: 'superAdmin' } };
    const { getByTestId } = render(<Guarded route={{ params: { houseId: 'h2' } }} />);
    expect(getByTestId('the-screen')).toBeTruthy();
  });

  it('refuses when there is neither a route house nor a selected one', () => {
    mockSelectedHouseId = null;
    mockToken = { claims: {}, role: { h1: 'superAdmin' } };
    expect(render(<Guarded />).getByTestId('no-access-screen')).toBeTruthy();
  });
});
