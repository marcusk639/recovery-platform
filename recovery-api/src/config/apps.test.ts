import {
  APP_REGISTRY,
  AppRegistryEntry,
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

  it('returns undefined for non-string input instead of throwing', () => {
    // Phase 2 JWT appId claims are client-influenceable; a non-string claim must
    // resolve to undefined, not throw `value.trim is not a function` (opaque 500).
    expect(resolveApp(undefined)).toBeUndefined();
    expect(resolveApp(123)).toBeUndefined();
    expect(resolveApp({ appId: 'homegroups' })).toBeUndefined();
  });

  it('never maps one lookup key to two different entries (no cross-entry collision)', () => {
    // appId/displayName may coincide WITHIN an entry (e.g. 'treatment-center');
    // what must never happen is one key silently resolving to a different entry
    // (byKey is last-writer-wins, so a collision would corrupt resolution).
    const owner = new Map<string, AppRegistryEntry>();
    for (const entry of APP_REGISTRY as readonly AppRegistryEntry[]) {
      const keys = [
        entry.appId.toLowerCase(),
        entry.displayName.toLowerCase(),
        ...(entry.aliases ?? []).map((a) => a.toLowerCase()),
      ];
      for (const key of keys) {
        const existing = owner.get(key);
        expect(existing === undefined || existing === entry).toBe(true);
        owner.set(key, entry);
      }
    }
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
