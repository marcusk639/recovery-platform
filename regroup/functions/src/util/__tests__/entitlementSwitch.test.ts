jest.mock('firebase-functions', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const mockGet = jest.fn();
jest.mock('firebase-admin', () => ({
  firestore: () => ({
    collection: () => ({ doc: () => ({ get: mockGet }) }),
  }),
}));

import {
  isPaywallEnabled,
  enforceHouseEntitlement,
  __resetPaywallCacheForTests,
} from '../entitlement';

const NOW = Date.parse('2026-09-30T12:00:00.000Z');

const snap = (data: unknown) => ({
  exists: data !== undefined,
  data: () => data,
});

beforeEach(() => {
  mockGet.mockReset();
  __resetPaywallCacheForTests();
});

describe('isPaywallEnabled', () => {
  it('is off when the config doc says enabled: false', async () => {
    mockGet.mockResolvedValue(snap({ enabled: false }));
    await expect(isPaywallEnabled(NOW)).resolves.toBe(false);
  });

  it('is on when the config doc says enabled: true', async () => {
    mockGet.mockResolvedValue(snap({ enabled: true }));
    await expect(isPaywallEnabled(NOW)).resolves.toBe(true);
  });

  it('stays on when the doc is missing', async () => {
    mockGet.mockResolvedValue(snap(undefined));
    await expect(isPaywallEnabled(NOW)).resolves.toBe(true);
  });

  it('stays on when the field is absent or not a boolean', async () => {
    mockGet.mockResolvedValue(snap({ enabled: 'yes' }));
    await expect(isPaywallEnabled(NOW)).resolves.toBe(true);
  });

  it('stays on when the read throws — fail closed, never fail open', async () => {
    // A denied or unavailable read must not silently disable the paywall.
    mockGet.mockRejectedValue(new Error('permission-denied'));
    await expect(isPaywallEnabled(NOW)).resolves.toBe(true);
  });

  it('caches within the TTL rather than reading per call', async () => {
    mockGet.mockResolvedValue(snap({ enabled: false }));

    await isPaywallEnabled(NOW);
    await isPaywallEnabled(NOW + 1000);

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('re-reads once the TTL has elapsed', async () => {
    mockGet.mockResolvedValue(snap({ enabled: false }));

    await isPaywallEnabled(NOW);
    await isPaywallEnabled(NOW + 120_000);

    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});

describe('enforceHouseEntitlement', () => {
  it('lets everything through when the kill switch is off', async () => {
    mockGet.mockResolvedValue(snap({ enabled: false }));

    await expect(
      enforceHouseEntitlement({ subscriptionStatus: 'canceled' }, 'house-1', NOW),
    ).resolves.toMatchObject({ entitled: true, reason: 'kill_switch_off' });
  });

  it('enforces the ladder when the kill switch is on', async () => {
    mockGet.mockResolvedValue(snap({ enabled: true }));

    let caught: { code?: string } | undefined;
    try {
      await enforceHouseEntitlement({ subscriptionStatus: 'canceled' }, 'house-1', NOW);
    } catch (err) {
      caught = err as { code?: string };
    }
    expect(caught?.code).toBe('failed-precondition');
  });

  it('grants an entitled house when the kill switch is on', async () => {
    mockGet.mockResolvedValue(snap({ enabled: true }));

    await expect(
      enforceHouseEntitlement({ subscriptionStatus: 'active' }, 'house-1', NOW),
    ).resolves.toMatchObject({ entitled: true, reason: 'active' });
  });
});
