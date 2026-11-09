import { makeDirectoryDb, type MockDoc } from '../../triggers/testing/directoryDbMock';
import { directoryMeetingId } from './identity';
import { reconcileMeetings, runMeetingSync, RESTAMP_AFTER_DAYS } from './meetingSync';
import type { MeetingGuideMeeting } from './sources/meetingGuide';
import type { SweepResult } from './meetingSweep';

const NOW = new Date('2026-11-08T12:00:00Z');
const stamp = (iso: string) => ({ toMillis: () => new Date(iso).getTime() });
const RECENT = stamp('2026-11-07T00:00:00Z');
const PRIOR_SWEEP = { 'script_progress/meetingSync': { lastHealthySweepStartedAt: NOW.getTime() } };

function row(over: Partial<MeetingGuideMeeting> = {}): MeetingGuideMeeting {
  return {
    id: 100,
    name: 'Sunrise Group',
    day: 2,
    time: '07:00:00',
    latitude: '30.2',
    longitude: '-97.7',
    formatted_address: '123 Main St, Austin, TX',
    address: '123 Main St',
    city: 'Austin',
    state: 'TX',
    postal_code: '78701',
    types: 'Open',
    timezone: 'America/Chicago',
    ...over,
  };
}

function idOf(m: MeetingGuideMeeting): string {
  return directoryMeetingId({
    name: m.name,
    day: m.day,
    time: m.time,
    link: m.conference_url ?? '',
    formattedAddress: m.formatted_address ?? m.address ?? '',
  });
}

/** A directory row exactly as a previous sync would have written `m`. */
function existing(m: MeetingGuideMeeting, over: MockDoc = {}): MockDoc {
  return {
    source: 'external',
    provider: 'AA',
    externalId: String(m.id),
    name: m.name,
    day: m.day,
    time: m.time.slice(0, 5),
    type: m.types,
    timezone: m.timezone,
    location: {
      lat: Number(m.latitude),
      lng: Number(m.longitude),
      geohash: expect.any(String) as unknown as string,
      address: m.address,
      city: m.city,
      state: m.state,
      zip: m.postal_code,
    },
    dataAsOf: null,
    createdAt: stamp('2026-01-01T00:00:00Z'),
    lastSeenAt: RECENT,
    lastRefreshedAt: RECENT,
    updatedAt: RECENT,
    ...over,
  };
}

describe('reconcileMeetings', () => {
  it('creates a meeting the directory has never seen', async () => {
    const { db, store } = makeDirectoryDb();
    const result = await reconcileMeetings([row()], { db, now: () => NOW, apply: true });
    expect(result.created).toBe(1);
    const doc = store.get(`directoryMeetings/${idOf(row())}`);
    expect(doc).toMatchObject({
      source: 'external',
      provider: 'AA',
      externalId: '100',
      name: 'Sunrise Group',
      time: '07:00',
      dataAsOf: null,
    });
    expect(doc?.createdAt).toBeDefined();
    expect(doc?.lastSeenAt).toBeDefined();
  });

  it('collapses two upstream listings of one meeting into one document', async () => {
    const { db, store } = makeDirectoryDb();
    const result = await reconcileMeetings([row({ id: 200 }), row({ id: 100 })], {
      db,
      now: () => NOW,
      apply: true,
    });
    expect(result.created).toBe(1);
    expect(result.collapsedDuplicates).toBe(1);
    expect(store.get(`directoryMeetings/${idOf(row())}`)?.externalId).toBe('100');
  });

  it('replaces the old document when a meeting is renamed, keeping when it was first seen', async () => {
    const before = row();
    const after = row({ name: 'Sunrise Serenity Group' });
    const createdAt = stamp('2020-05-05T00:00:00Z');
    const { db, store } = makeDirectoryDb({
      [`directoryMeetings/${idOf(before)}`]: existing(before, { createdAt }),
    });
    const result = await reconcileMeetings([after], { db, now: () => NOW, apply: true });

    expect(result.replaced).toBe(1);
    expect(store.has(`directoryMeetings/${idOf(before)}`)).toBe(false);
    const doc = store.get(`directoryMeetings/${idOf(after)}`);
    expect(doc?.name).toBe('Sunrise Serenity Group');
    expect(doc?.createdAt).toBe(createdAt);
  });

  it('does not rewrite an unchanged meeting seen recently', async () => {
    const m = row();
    const seeded = existing(m);
    const { db: seedDb, store } = makeDirectoryDb({});
    await reconcileMeetings([m], { db: seedDb, now: () => NOW, apply: true });
    const key = `directoryMeetings/${idOf(m)}`;
    store.set(key, { ...store.get(key), lastSeenAt: seeded.lastSeenAt, updatedAt: RECENT });

    const result = await reconcileMeetings([m], { db: seedDb, now: () => NOW, apply: true });
    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
    expect(store.get(key)?.updatedAt).toBe(RECENT);
  });

  it('re-stamps an unchanged meeting before the stale prune could reach it', async () => {
    const m = row();
    const { db, store } = makeDirectoryDb();
    await reconcileMeetings([m], { db, now: () => NOW, apply: true });
    const key = `directoryMeetings/${idOf(m)}`;
    const old = new Date(NOW.getTime() - (RESTAMP_AFTER_DAYS + 1) * 86_400_000).toISOString();
    store.set(key, { ...store.get(key), lastSeenAt: stamp(old), updatedAt: RECENT });

    const result = await reconcileMeetings([m], { db, now: () => NOW, apply: true });
    expect(result.restamped).toBe(1);
    expect(store.get(key)?.lastSeenAt).not.toEqual(stamp(old));
    expect(store.get(key)?.updatedAt).toBe(RECENT);
  });

  it('removes a field the source no longer provides', async () => {
    const withLink = row({ conference_url_notes: 'Passcode 1234' });
    const { db, store } = makeDirectoryDb();
    await reconcileMeetings([withLink], { db, now: () => NOW, apply: true });
    const key = `directoryMeetings/${idOf(withLink)}`;
    expect(store.get(key)?.onlineNotes).toBe('Passcode 1234');

    const result = await reconcileMeetings([row()], { db, now: () => NOW, apply: true });
    expect(result.updated).toBe(1);
    expect(store.get(key)?.onlineNotes).toBeUndefined();
  });

  it('confirms a snapshot row as live by clearing its dataAsOf', async () => {
    const m = row();
    const { db, store } = makeDirectoryDb();
    await reconcileMeetings([m], { db, now: () => NOW, apply: true });
    const key = `directoryMeetings/${idOf(m)}`;
    store.set(key, { ...store.get(key), dataAsOf: '2023-03-19' });

    await reconcileMeetings([m], { db, now: () => NOW, apply: true });
    expect(store.get(key)?.dataAsOf).toBeNull();
  });

  it('never overwrites a meeting a person created in an app', async () => {
    const m = row();
    const key = `directoryMeetings/${idOf(m)}`;
    const appDoc = { source: 'app', provider: 'AA', name: 'Mine' };
    const { db, store } = makeDirectoryDb({ [key]: appDoc });
    const result = await reconcileMeetings([m], { db, now: () => NOW, apply: true });
    expect(result.skippedAppOwned).toBe(1);
    expect(store.get(key)).toEqual(appDoc);
  });

  it('leaves other providers alone', async () => {
    const naKey = 'directoryMeetings/na-1';
    const naDoc = { source: 'external', provider: 'NA', externalId: '100', name: 'NA group' };
    const { db, store } = makeDirectoryDb({ [naKey]: naDoc });
    await reconcileMeetings([row()], { db, now: () => NOW, apply: true });
    expect(store.get(naKey)).toEqual(naDoc);
  });

  it('counts a row it cannot map instead of failing the run', async () => {
    const { db } = makeDirectoryDb();
    const result = await reconcileMeetings([row({ time: 'not-a-time' }), row({ id: 101 })], {
      db,
      now: () => NOW,
      apply: true,
    });
    expect(result.unmappable).toBe(1);
    expect(result.created).toBe(1);
  });

  it('reports what it would do without writing on a dry run', async () => {
    const before = row();
    const { db, store } = makeDirectoryDb({
      [`directoryMeetings/${idOf(before)}`]: existing(before),
    });
    const snapshot = new Map(store);
    const result = await reconcileMeetings(
      [row({ name: 'Renamed' }), row({ id: 101, name: 'New' })],
      { db, now: () => NOW, apply: false },
    );
    expect(result.created).toBe(2);
    expect(result.replaced).toBe(1);
    expect(store).toEqual(snapshot);
  });
});

describe('runMeetingSync', () => {
  const sweep = (over: Partial<SweepResult> = {}): SweepResult => ({
    meetings: [row()],
    baseCells: 100,
    requests: 100,
    cappedResponses: 0,
    failedBaseCells: 0,
    unresolvedSpots: [],
    droppedNonUs: 0,
    rateLimited: 0,
    ...over,
  });
  const staleKey = 'directoryMeetings/gone';
  const staleDoc = {
    source: 'external',
    provider: 'AA',
    externalId: '999',
    name: 'Gone',
    location: { lat: 40, lng: -100 },
    lastSeenAt: stamp('2026-01-01T00:00:00Z'),
  };
  const manyFresh = () => {
    const rows: Record<string, MockDoc> = { [staleKey]: staleDoc, ...PRIOR_SWEEP };
    for (let i = 0; i < 50; i++) {
      rows[`directoryMeetings/fresh-${i}`] = {
        source: 'external',
        provider: 'AA',
        externalId: String(1000 + i),
        location: { lat: 40, lng: -100 },
        lastSeenAt: RECENT,
      };
    }
    return rows;
  };
  it('refuses to touch the directory when the API rejects the key', async () => {
    const { db, store } = makeDirectoryDb(manyFresh());
    const snapshot = new Map(store);
    await expect(
      runMeetingSync({
        db,
        now: () => NOW,
        apply: true,
        sweep: async () => sweep({ aborted: 'unauthorized', meetings: [] }),
      }),
    ).rejects.toThrow(/rejected the API key/);
    expect(store).toEqual(snapshot);
  });

  it('prunes meetings gone from the source after a healthy sweep', async () => {
    const { db, store } = makeDirectoryDb(manyFresh());
    const result = await runMeetingSync({
      db,
      now: () => NOW,
      apply: true,
      sweep: async () => sweep(),
    });
    expect(store.has(staleKey)).toBe(false);
    expect(result.prune?.deleted).toBe(1);
  });

  it('keeps meetings it could not re-see when any cell failed', async () => {
    const { db, store } = makeDirectoryDb(manyFresh());
    const result = await runMeetingSync({
      db,
      now: () => NOW,
      apply: true,
      sweep: async () => sweep({ failedBaseCells: 1 }),
    });
    expect(store.has(staleKey)).toBe(true);
    expect(result.prune).toBeUndefined();
  });

  it('keeps meetings it could not re-see when the sweep found nothing', async () => {
    const { db, store } = makeDirectoryDb(manyFresh());
    await runMeetingSync({
      db,
      now: () => NOW,
      apply: true,
      sweep: async () => sweep({ meetings: [] }),
    });
    expect(store.has(staleKey)).toBe(true);
  });

  it('never prunes on a dry run', async () => {
    const { db, store } = makeDirectoryDb(manyFresh());
    await runMeetingSync({ db, now: () => NOW, apply: false, sweep: async () => sweep() });
    expect(store.has(staleKey)).toBe(true);
  });
});
