jest.mock('../../scripts/scriptBootstrap', () => ({}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));

import { parseSwitchArgs } from '../../scripts/setServerSwitch';

describe('parseSwitchArgs', () => {
  it('maps the sales switch to config/sales.open, dry run by default', () => {
    expect(parseSwitchArgs(['--switch=sales', '--value=false'])).toEqual({
      path: 'config/sales',
      field: 'open',
      value: false,
      apply: false,
    });
  });

  it('maps the paywall switch to paywall/config.enabled, written with --apply', () => {
    expect(parseSwitchArgs(['--switch=paywall', '--value=true', '--apply'])).toEqual({
      path: 'paywall/config',
      field: 'enabled',
      value: true,
      apply: true,
    });
  });

  it('refuses a value other than true or false', () => {
    expect(() => parseSwitchArgs(['--switch=sales', '--value=yes'])).toThrow();
  });

  it("refuses a switch it doesn't know", () => {
    expect(() => parseSwitchArgs(['--switch=rent', '--value=true'])).toThrow();
  });
});
