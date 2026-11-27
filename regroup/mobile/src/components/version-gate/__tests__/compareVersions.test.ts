import { compareVersions, isUpdateRequired } from '../compareVersions';

describe('compareVersions', () => {
  it('compares each dotted part as a number, not as text', () => {
    expect(compareVersions('1.10', '1.9')).toBe(1);
    expect(compareVersions('1.9', '1.10')).toBe(-1);
  });

  it('treats a missing part as zero', () => {
    expect(compareVersions('1.53', '1.53.0')).toBe(0);
    expect(compareVersions('1.53.1', '1.53')).toBe(1);
  });

  it('orders across the major part', () => {
    expect(compareVersions('0.55', '1.0')).toBe(-1);
    expect(compareVersions('2.0', '1.99')).toBe(1);
  });

  it('returns 0 for the same version', () => {
    expect(compareVersions('1.53', '1.53')).toBe(0);
  });
});

describe('isUpdateRequired', () => {
  it('blocks only when the minimum is strictly above this build', () => {
    expect(isUpdateRequired('1.53', '1.54')).toBe(true);
    expect(isUpdateRequired('1.53', '1.53')).toBe(false);
    expect(isUpdateRequired('1.53', '1.53.0')).toBe(false);
    expect(isUpdateRequired('1.53', '1.52')).toBe(false);
    expect(isUpdateRequired('1.9', '1.10')).toBe(true);
    expect(isUpdateRequired('1.10', '1.9')).toBe(false);
  });

  it.each([[null], [undefined], [''], ['latest'], ['1.'], ['v2.0'], [2], [{}], ['1.2.3.4']])(
    'lets the user in when the minimum is %p',
    (min) => {
      expect(isUpdateRequired('1.53', min)).toBe(false);
    },
  );

  it('lets the user in when this build has no usable version', () => {
    expect(isUpdateRequired(undefined, '99.0')).toBe(false);
    expect(isUpdateRequired('dev', '99.0')).toBe(false);
  });
});
