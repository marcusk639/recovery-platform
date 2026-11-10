import { runSnapshotImport, type SnapshotDoc } from './snapshotImport';
import { mapNaMeeting } from './sources/naDataset';
import { directoryMeetingId } from './identity';

const SERVER_TS = '__serverTimestamp__';

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__serverTimestamp__' },
}));

const AS_OF = new Date('2023-03-19T15:10:57Z');

function naDoc(over: Record<string, unknown> = {}): SnapshotDoc {
  return {
    asOf: AS_OF,
    data: {
      id: 'na-1',
      name: 'Serenity Now',
      day: 'saturday',
      time: '12:00',
      lat: 40.7,
      lng: -74,
      address: '2 Elm St',
      ...over,
    },
  };
}

function idOf(doc: SnapshotDoc): string {
  return mapNaMeeting(doc.data)!.id;
}

function makeDest(seed: Record<string, Record<string, unknown>> = {}) {
  const store = new Map(Object.entries(seed));
  const commits: number[] = [];
  const db = {
    collection: () => ({ doc: (id: string) => ({ id }) }),
    getAll: async (...refs: Array<{ id: string }>) =>
      refs.map((ref) => ({
        id: ref.id,
        exists: store.has(ref.id),
        data: () => store.get(ref.id),
      })),
    batch: () => {
      const ops: Array<[string, Record<string, unknown>]> = [];
      return {
        set: (ref: { id: string }, data: Record<string, unknown>) => ops.push([ref.id, data]),
        commit: async () => {
          commits.push(ops.length);
          for (const [id, data] of ops) store.set(id, { ...(store.get(id) ?? {}), ...data });
        },
      };
    },
  } as unknown as FirebaseFirestore.Firestore;
  return { db, store, commits };
}

async function* pagesOf(...pages: SnapshotDoc[][]) {
  yield* pages;
}

describe('runSnapshotImport', () => {
  it('writes nothing in a dry run but reports what it would do', async () => {
    const { db, store, commits } = makeDest();

    const result = await runSnapshotImport({
      pages: pagesOf([naDoc()]),
      map: mapNaMeeting,
      destDb: db,
      apply: false,
    });

    expect(result).toMatchObject({ read: 1, upserted: 1, applied: false });
    expect(store.size).toBe(0);
    expect(commits).toEqual([]);
  });

  it('writes a row marked with its data date and the import timestamps', async () => {
    const { db, store } = makeDest();
    const doc = naDoc();

    await runSnapshotImport({ pages: pagesOf([doc]), map: mapNaMeeting, destDb: db, apply: true });

    expect(store.get(idOf(doc))).toMatchObject({
      source: 'external',
      provider: 'NA',
      name: 'Serenity Now',
      dataAsOf: '2023-03-19',
      lastSeenAt: SERVER_TS,
      lastRefreshedAt: SERVER_TS,
      updatedAt: SERVER_TS,
      createdAt: SERVER_TS,
    });
    expect(store.get(idOf(doc))?.id).toBeUndefined();
  });

  it('counts rows it cannot map and skips them', async () => {
    const { db, store } = makeDest();

    const result = await runSnapshotImport({
      pages: pagesOf([naDoc({ name: '' }), naDoc({ lat: 0, lng: 0 }), naDoc()]),
      map: mapNaMeeting,
      destDb: db,
      apply: true,
    });

    expect(result).toMatchObject({ read: 3, skippedUnmappable: 2, upserted: 1 });
    expect(store.size).toBe(1);
  });

  it('collapses source rows that resolve to the same directory id, across pages', async () => {
    const { db, store } = makeDest();

    const result = await runSnapshotImport({
      pages: pagesOf([naDoc()], [naDoc({ id: 'na-2' })]),
      map: mapNaMeeting,
      destDb: db,
      apply: true,
    });

    expect(result).toMatchObject({ read: 2, duplicates: 1, upserted: 1 });
    expect(store.size).toBe(1);
  });

  it('never touches an app-owned row', async () => {
    const doc = naDoc();
    const { db, store } = makeDest({ [idOf(doc)]: { source: 'app', name: 'Mine' } });

    const result = await runSnapshotImport({
      pages: pagesOf([doc]),
      map: mapNaMeeting,
      destDb: db,
      apply: true,
    });

    expect(result).toMatchObject({ skippedAppOwned: 1, upserted: 0 });
    expect(store.get(idOf(doc))).toEqual({ source: 'app', name: 'Mine' });
  });

  it.each([
    ['absent', {}],
    ['cleared by a live sweep', { dataAsOf: null }],
  ])('does not overwrite a live row with old data (dataAsOf %s)', async (_label, marker) => {
    const doc = naDoc();
    const live = { source: 'external', name: 'Fresher Name', ...marker };
    const { db, store } = makeDest({ [idOf(doc)]: live });

    const result = await runSnapshotImport({
      pages: pagesOf([doc]),
      map: mapNaMeeting,
      destDb: db,
      apply: true,
    });

    expect(result).toMatchObject({ skippedLive: 1, upserted: 0 });
    expect(store.get(idOf(doc))).toEqual(live);
  });

  it('can be re-run: updates an earlier import and keeps its createdAt', async () => {
    const doc = naDoc();
    const { db, store } = makeDest({
      [idOf(doc)]: { source: 'external', dataAsOf: '2020-01-01', createdAt: 'ORIGINAL' },
    });

    const result = await runSnapshotImport({
      pages: pagesOf([doc]),
      map: mapNaMeeting,
      destDb: db,
      apply: true,
    });

    expect(result.upserted).toBe(1);
    expect(store.get(idOf(doc))).toMatchObject({ dataAsOf: '2023-03-19', createdAt: 'ORIGINAL' });
  });

  it('reports the range of data dates', async () => {
    const { db } = makeDest();
    const older = { ...naDoc({ name: 'Older' }), asOf: new Date('2023-01-02T00:00:00Z') };
    const newer = { ...naDoc({ name: 'Newer' }), asOf: new Date('2023-06-07T00:00:00Z') };

    const result = await runSnapshotImport({
      pages: pagesOf([newer, older]),
      map: mapNaMeeting,
      destDb: db,
      apply: false,
    });

    expect(result.oldestDataAsOf).toBe('2023-01-02');
    expect(result.newestDataAsOf).toBe('2023-06-07');
  });

  it('commits one batch per page and skips the commit for an empty one', async () => {
    const { db, commits } = makeDest();
    const second = naDoc({ name: 'Second' });

    await runSnapshotImport({
      pages: pagesOf([naDoc()], [], [second]),
      map: mapNaMeeting,
      destDb: db,
      apply: true,
    });

    expect(commits).toEqual([1, 1]);
    expect(
      directoryMeetingId({ name: 'Second', day: 6, time: '12:00', formattedAddress: '2 Elm St' }),
    ).toBe(idOf(second));
  });
});
