/**
 * The guard only works if navigators.tsx registers the guarded components. A
 * raw `component={DrugTestingScreen}` would pass every render test, so this
 * reads the registrations themselves (review of P5 Task 20).
 */
import fs from 'fs';
import path from 'path';
import { GUARDED_ROUTE_RANKS } from '../../../navigation/guardedScreens';
import { Routes } from '../../../navigation/types';


const source = fs.readFileSync(
  path.resolve(__dirname, '../../../navigation/navigators.tsx'),
  'utf8',
);
const enumName = (value: string) =>
  Object.entries(Routes).find(([, v]) => v === value)?.[0] as string;

describe('navigators.tsx registers operator-only screens behind their role check', () => {
  it.each(Object.keys(GUARDED_ROUTE_RANKS))('%s', (route) => {
    const name = enumName(route);
    const registration = new RegExp(
      `name=\\{Routes\\.${name}\\}\\s*component=\\{([^}]+\\]?)\\}`,
    ).exec(source);
    expect(registration?.[1]).toBe(`guardedScreens[Routes.${name}]`);
  });

  it('imports none of the guarded screens directly', () => {
    expect(source).not.toMatch(/from '\.\.\/screens\/DrugTesting\//);
    expect(source).not.toMatch(
      /from '\.\.\/screens\/(ResidentIntake|Applications|GuestImport|BalanceDashboard|AdminReport|StaffNotes)\//,
    );
    expect(source).not.toMatch(
      /from '\.\.\/screens\/HouseSettings\/(HouseSettings|PaymentDashboard|StripeSettingsScreen)'/,
    );
  });

  it('imports neither rent screen directly (RentSettings, GuestBalance)', () => {
    expect(source).not.toMatch(/from '\.\.\/screens\/HouseSettings\/RentSettingsScreen'/);
    expect(source).not.toMatch(/from '\.\.\/screens\/GuestUpdate\/GuestBalanceScreen'/);
  });
});
