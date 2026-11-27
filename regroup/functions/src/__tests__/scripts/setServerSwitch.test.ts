jest.mock('../../scripts/scriptBootstrap', () => ({}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));

import { nestedValue, parseSwitchArgs } from '../../scripts/setServerSwitch';

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

  it('maps the minVersion switch to config/app.minVersion.<platform>', () => {
    expect(
      parseSwitchArgs(['--switch=minVersion', '--platform=ios', '--value=1.54', '--apply']),
    ).toEqual({ path: 'config/app', field: 'minVersion.ios', value: '1.54', apply: true });
    expect(parseSwitchArgs(['--switch=minVersion', '--platform=android', '--value=0.56.1'])).toEqual(
      { path: 'config/app', field: 'minVersion.android', value: '0.56.1', apply: false },
    );
  });

  it('clears the minimum version with --value=none', () => {
    expect(parseSwitchArgs(['--switch=minVersion', '--platform=ios', '--value=none'])).toEqual({
      path: 'config/app',
      field: 'minVersion.ios',
      value: null,
      apply: false,
    });
  });

  it.each([['1'], ['v1.2'], ['1.2.3.4'], ['true'], ['']])(
    'refuses minVersion %p, which is not x.y[.z] or none',
    (value) => {
      expect(() =>
        parseSwitchArgs(['--switch=minVersion', '--platform=ios', `--value=${value}`]),
      ).toThrow();
    },
  );

  it('refuses minVersion without a known platform', () => {
    expect(() => parseSwitchArgs(['--switch=minVersion', '--value=1.54'])).toThrow();
    expect(() =>
      parseSwitchArgs(['--switch=minVersion', '--platform=web', '--value=1.54']),
    ).toThrow();
  });
});

describe('nestedValue', () => {
  it('writes a dotted field as a nested map, so a merge keeps the other platform', () => {
    expect(nestedValue('minVersion.ios', '1.54')).toEqual({ minVersion: { ios: '1.54' } });
  });

  it('writes a plain field as is', () => {
    expect(nestedValue('open', true)).toEqual({ open: true });
  });
});
