import { logger } from 'firebase-functions/v2';
import { MAX_PRUNE_FRACTION, PRUNE_PAGE_SIZE, pruneStale } from './pruneStale';
import {
  freshRows,
  IN_GRID,
  makeDirectoryDb,
  type MockDoc,
} from '../../triggers/testing/directoryDbMock';

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__serverTimestamp__' },
  Timestamp: {
    fromMillis: (ms: number) => ({ __ts__: true, toMillis: () => ms }),
  },
}));

jest.mock('firebase-functions/v2', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const NOW = new Date('2026-11-08T03:00:00Z');
const STALE = { toMillis: () => new Date('2026-07-16T00:00:00Z').getTime() };

function staleRow(provider: string): MockDoc {
  return { source: 'external', provider, location: IN_GRID, lastSeenAt: STALE };
}

describe('pruneStale arguments', () => {
  it('rejects providers with no live source, and a call with no sweep start', () => {
    const { db } = makeDirectoryDb();
    const deps = { db, now: () => NOW };
    // Compile-time checks: never called, because ts-jest fails the file if these type-check.
    const invalid = [
      // @ts-expect-error NA has no live source, so nothing could re-see its rows.
      () => pruneStale(deps, ['NA'], NOW.getTime()),
      // @ts-expect-error CUSTOM has no live source either.
      () => pruneStale(deps, ['CUSTOM'], NOW.getTime()),
      // @ts-expect-error The sweep start is required.
      () => pruneStale(deps, ['AA']),
    ];
    expect(invalid).toHaveLength(3);
  });
});

describe('pruneStale paging', () => {
  it('deletes more than one page of stale rows for a provider', async () => {
    const rows: Record<string, MockDoc> = {};
    for (let i = 0; i < PRUNE_PAGE_SIZE + 1; i++) {
      rows[`directoryMeetings/stale-${i}`] = staleRow('AA');
    }
    const { db, store } = makeDirectoryDb({ ...rows, ...freshRows('AA', 4600) });

    const result = await pruneStale({ db, now: () => NOW }, ['AA'], NOW.getTime());

    expect(result.deleted).toBe(PRUNE_PAGE_SIZE + 1);
    expect([...store.keys()].filter((k) => k.includes('/stale-'))).toEqual([]);
  });

  it('only looks at the providers it was given', async () => {
    const { db, store } = makeDirectoryDb({
      'directoryMeetings/stale-aa': staleRow('AA'),
      'directoryMeetings/stale-na': staleRow('NA'),
      ...freshRows('AA', 20),
    });

    const result = await pruneStale({ db, now: () => NOW }, ['AA'], NOW.getTime());

    expect(result.deleted).toBe(1);
    expect(store.has('directoryMeetings/stale-na')).toBe(true);
  });

  it('makes no queries when no provider is safe to prune', async () => {
    const { db, store } = makeDirectoryDb({ 'directoryMeetings/stale-aa': staleRow('AA') });

    const result = await pruneStale({ db, now: () => NOW }, [], NOW.getTime());

    expect(result).toEqual({ deleted: 0, scanned: 0, blocked: [] });
    expect(store.has('directoryMeetings/stale-aa')).toBe(true);
  });
});

describe('pruneStale limit on how much one sweep may delete', () => {
  function staleRows(count: number): Record<string, MockDoc> {
    const rows: Record<string, MockDoc> = {};
    for (let i = 0; i < count; i++) rows[`directoryMeetings/stale-${i}`] = staleRow('AA');
    return rows;
  }

  it('deletes nothing when a sweep would remove most of a provider', async () => {
    const { db, store } = makeDirectoryDb({ ...staleRows(50), ...freshRows('AA', 50) });

    const result = await pruneStale({ db, now: () => NOW }, ['AA'], NOW.getTime());

    expect(result).toEqual({ deleted: 0, scanned: 0, blocked: ['AA'] });
    expect(logger.error).toHaveBeenCalledWith('refreshDirectory: prune blocked', {
      provider: 'AA',
      stale: 50,
      total: 100,
    });
    expect([...store.keys()].filter((k) => k.includes('/stale-'))).toHaveLength(50);
  });

  it('allows a normal amount of turnover, up to the limit', async () => {
    const atLimit = 100 * MAX_PRUNE_FRACTION;
    const { db } = makeDirectoryDb({ ...staleRows(atLimit), ...freshRows('AA', 100 - atLimit) });

    const result = await pruneStale({ db, now: () => NOW }, ['AA'], NOW.getTime());

    expect(result).toMatchObject({ deleted: atLimit, blocked: [] });
  });

  it('blocks just above the limit', async () => {
    const overLimit = 100 * MAX_PRUNE_FRACTION + 1;
    const { db } = makeDirectoryDb({
      ...staleRows(overLimit),
      ...freshRows('AA', 100 - overLimit),
    });

    const result = await pruneStale({ db, now: () => NOW }, ['AA'], NOW.getTime());

    expect(result).toMatchObject({ deleted: 0, blocked: ['AA'] });
  });

  it('judges each provider separately', async () => {
    const { db, store } = makeDirectoryDb({
      ...staleRows(50),
      ...freshRows('AA', 50),
      'directoryMeetings/stale-cr': staleRow('CELEBRATE_RECOVERY'),
      ...freshRows('CELEBRATE_RECOVERY', 20),
    });

    const result = await pruneStale(
      { db, now: () => NOW },
      ['AA', 'CELEBRATE_RECOVERY'],
      NOW.getTime(),
    );

    expect(result).toEqual({ deleted: 1, scanned: 1, blocked: ['AA'] });
    expect(store.has('directoryMeetings/stale-cr')).toBe(false);
  });
});

describe('pruneStale rows the live sweep can never re-see', () => {
  it.each([
    ['Honolulu', { lat: 21.3, lng: -157.8 }],
    ['Anchorage', { lat: 61.2, lng: -149.9 }],
    ['San Juan', { lat: 18.4, lng: -66.1 }],
    ['no location', undefined],
  ])('keeps a stale row outside the grid (%s)', async (_label, location) => {
    const { db, store } = makeDirectoryDb({
      'directoryMeetings/outside': { ...staleRow('AA'), location },
      ...freshRows('AA', 20),
    });

    const result = await pruneStale({ db, now: () => NOW }, ['AA'], NOW.getTime());

    expect(result.deleted).toBe(0);
    expect(store.has('directoryMeetings/outside')).toBe(true);
  });

  it('still reaches in-grid rows behind a full page of out-of-grid ones', async () => {
    const rows: Record<string, MockDoc> = {};
    for (let i = 0; i < PRUNE_PAGE_SIZE; i++) {
      rows[`directoryMeetings/outside-${i}`] = {
        ...staleRow('AA'),
        location: { lat: 21.3, lng: -157.8 },
      };
    }
    const { db, store } = makeDirectoryDb({
      ...rows,
      'directoryMeetings/stale-in-grid': staleRow('AA'),
      ...freshRows('AA', 4600),
    });

    const result = await pruneStale({ db, now: () => NOW }, ['AA'], NOW.getTime());

    expect(result.deleted).toBe(1);
    expect(store.has('directoryMeetings/stale-in-grid')).toBe(false);
    expect(store.has('directoryMeetings/outside-0')).toBe(true);
  });
});
