import { makeDirectoryDb, type MockDoc } from '../../triggers/testing/directoryDbMock';
import type { SweepResult } from './meetingSweep';
import { runMeetingSync } from './meetingSync';

const NOW = new Date('2026-11-08T12:00:00Z');
const DAY = 86_400_000;
const daysAgo = (days: number) => NOW.getTime() - days * DAY;
const seenDaysAgo = (days: number) => ({ toMillis: () => daysAgo(days) });

const STATE = 'script_progress/meetingSync';
const STALE = 'directoryMeetings/stale';
const ON_LAND = { lat: 40, lng: -100 };

const sweep = (over: Partial<SweepResult> = {}): SweepResult => ({
  meetings: [
    {
      id: 1,
      name: 'Seen',
      day: 2,
      time: '07:00:00',
      latitude: '40',
      longitude: '-100',
    },
  ],
  baseCells: 100,
  requests: 100,
  cappedResponses: 0,
  failedBaseCells: 0,
  unresolvedSpots: [],
  droppedNonUs: 0,
  rateLimited: 0,
  ...over,
});

function directory(staleDoc: MockDoc, previousSweepDaysAgo?: number): Record<string, MockDoc> {
  const rows: Record<string, MockDoc> = {
    [STALE]: { source: 'external', provider: 'AA', externalId: '999', ...staleDoc },
  };
  for (let i = 0; i < 50; i++) {
    rows[`directoryMeetings/fresh-${i}`] = {
      source: 'external',
      provider: 'AA',
      externalId: String(1000 + i),
      location: ON_LAND,
      lastSeenAt: seenDaysAgo(1),
    };
  }
  if (previousSweepDaysAgo !== undefined) {
    rows[STATE] = { lastHealthySweepStartedAt: daysAgo(previousSweepDaysAgo) };
  }
  return rows;
}

async function run(seed: Record<string, MockDoc>, result = sweep(), apply = true) {
  const { db, store } = makeDirectoryDb(seed);
  const synced = await runMeetingSync({ db, now: () => NOW, apply, sweep: async () => result });
  return { store, synced };
}

describe('runMeetingSync coverage', () => {
  it('reports coverage from the sweep, including on a dry run', async () => {
    const { synced } = await run(directory({}), sweep(), false);
    expect(Object.values(synced.coverage.byState)).toEqual([1]);
    expect(synced.coverage.places.length).toBeGreaterThan(0);
  });
});

describe('runMeetingSync prune', () => {
  it('deletes nothing on the first healthy sweep, which only records that it ran', async () => {
    const { store, synced } = await run(
      directory({ location: ON_LAND, lastSeenAt: seenDaysAgo(300) }),
    );
    expect(store.has(STALE)).toBe(true);
    expect(synced.prune).toBeUndefined();
    expect(store.get(STATE)).toEqual({ lastHealthySweepStartedAt: NOW.getTime() });
  });

  it('keeps a meeting the previous sweep saw, however long ago that sweep ran', async () => {
    // Forty-six days old is well past the horizon, but the sweep 45 days ago saw it.
    const { store } = await run(directory({ location: ON_LAND, lastSeenAt: seenDaysAgo(46) }, 45));
    expect(store.has(STALE)).toBe(true);
  });

  it('keeps a meeting the previous sweep saw but had no need to re-stamp', async () => {
    // A sweep leaves a row alone if it was stamped within 14 days, so 58 days is still "seen".
    const { store } = await run(directory({ location: ON_LAND, lastSeenAt: seenDaysAgo(58) }, 45));
    expect(store.has(STALE)).toBe(true);
  });

  it('deletes a meeting two healthy sweeps in a row have missed', async () => {
    const { store, synced } = await run(
      directory({ location: ON_LAND, lastSeenAt: seenDaysAgo(60) }, 45),
    );
    expect(store.has(STALE)).toBe(false);
    expect(synced.prune?.deleted).toBe(1);
  });

  it('still waits out the 30 days when two sweeps run close together', async () => {
    const { store } = await run(directory({ location: ON_LAND, lastSeenAt: seenDaysAgo(25) }, 2));
    expect(store.has(STALE)).toBe(true);
  });

  it('moves the record forward after a healthy sweep', async () => {
    const { store } = await run(directory({ location: ON_LAND, lastSeenAt: seenDaysAgo(1) }, 45));
    expect(store.get(STATE)).toEqual({ lastHealthySweepStartedAt: NOW.getTime() });
  });

  it('does not count a sweep with a failed cell as the first of the two', async () => {
    const { store } = await run(
      directory({ location: ON_LAND, lastSeenAt: seenDaysAgo(300) }, 45),
      sweep({ failedBaseCells: 1 }),
    );
    expect(store.get(STATE)).toEqual({ lastHealthySweepStartedAt: daysAgo(45) });
  });

  it('does not count a dry run as the first of the two', async () => {
    const { store } = await run(
      directory({ location: ON_LAND, lastSeenAt: seenDaysAgo(300) }),
      sweep(),
      false,
    );
    expect(store.has(STATE)).toBe(false);
  });

  it('keeps a meeting at a spot with more meetings than one response can return', async () => {
    const spot = { s: 34.0, n: 34.0001, w: -118.3001, e: -118.3 };
    const { store } = await run(
      directory({ location: { lat: 34.00005, lng: -118.30005 }, lastSeenAt: seenDaysAgo(300) }, 45),
      sweep({ unresolvedSpots: [spot] }),
    );
    expect(store.has(STALE)).toBe(true);
  });

  it('can delete a meeting anywhere the sweep covers, such as Alaska', async () => {
    const { store } = await run(
      directory({ location: { lat: 61.22, lng: -149.9 }, lastSeenAt: seenDaysAgo(300) }, 45),
    );
    expect(store.has(STALE)).toBe(false);
  });

  it('keeps a meeting outside the area the sweep covers, because it can never be re-seen', async () => {
    const { store } = await run(
      directory({ location: { lat: 55, lng: -100 }, lastSeenAt: seenDaysAgo(300) }, 45),
    );
    expect(store.has(STALE)).toBe(true);
  });

  it('keeps a meeting with no coordinates, because it cannot be placed', async () => {
    const { store } = await run(directory({ lastSeenAt: seenDaysAgo(300) }, 45));
    expect(store.has(STALE)).toBe(true);
  });
});
