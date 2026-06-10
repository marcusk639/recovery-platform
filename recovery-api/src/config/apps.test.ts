import {
  resolveApp,
  resolveAppId,
  isOriginatorAppId,
  isTargetAppId,
  ORIGINATOR_APP_IDS,
  TARGET_APP_IDS,
} from './apps';

describe('app registry resolution', () => {
  it('resolves display names to canonical app-ids', () => {
    expect(resolveAppId('Homegroups')).toBe('homegroups');
    expect(resolveAppId('Regroup')).toBe('phoenix-cleanhouse');
    expect(resolveAppId('Next Step Recovery')).toBe('nextstep-recovery');
  });

  it('resolves the legacy sober-living alias to phoenix-cleanhouse', () => {
    expect(resolveAppId('sober-living')).toBe('phoenix-cleanhouse');
  });

  it('resolves canonical app-ids to themselves', () => {
    expect(resolveAppId('homegroups')).toBe('homegroups');
    expect(resolveAppId('treatment-center')).toBe('treatment-center');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(resolveAppId('  rEgRoUp  ')).toBe('phoenix-cleanhouse');
  });

  it('returns undefined for unknown values', () => {
    expect(resolveApp('not-an-app')).toBeUndefined();
    expect(resolveAppId('not-an-app')).toBeUndefined();
  });

  it('classifies originators vs targets', () => {
    // treatment-center is target-only (no credentials of its own).
    expect(isOriginatorAppId('treatment-center')).toBe(false);
    expect(isTargetAppId('treatment-center')).toBe(true);
    expect(isOriginatorAppId('nextstep-recovery')).toBe(true);
    expect(ORIGINATOR_APP_IDS).not.toContain('treatment-center');
    expect(TARGET_APP_IDS).toContain('treatment-center');
  });
});
