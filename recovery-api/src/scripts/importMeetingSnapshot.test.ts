import {
  assertSourceBillingEnabled,
  IMPORT_SOURCES,
  parseImportArgs,
  readSnapshotPages,
} from './importMeetingSnapshot';

jest.mock('firebase-admin/app', () => ({ initializeApp: jest.fn(), getApps: () => [] }));
jest.mock('firebase-admin/firestore', () => ({
  FieldPath: { documentId: () => '__name__' },
  FieldValue: { serverTimestamp: () => '__serverTimestamp__' },
  getFirestore: jest.fn(),
}));

describe('parseImportArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseImportArgs(['--provider', 'NA'])).toEqual({ provider: 'NA', apply: false });
  });

  it('writes only with an explicit --apply', () => {
    expect(parseImportArgs(['--provider', 'AA', '--apply'])).toEqual({
      provider: 'AA',
      apply: true,
    });
  });

  it.each([[[]], [['--provider']], [['--provider', 'CELEBRATE_RECOVERY']], [['--provider', 'aa']]])(
    'rejects %j',
    (argv) => {
      expect(() => parseImportArgs(argv)).toThrow(/--provider/);
    },
  );

  it('rejects an unknown flag rather than ignoring a typo of --apply', () => {
    expect(() => parseImportArgs(['--provider', 'NA', '--aply'])).toThrow(/--aply/);
  });
});

describe('assertSourceBillingEnabled', () => {
  it('allows a scan when the source project has billing on', async () => {
    await expect(
      assertSourceBillingEnabled('some-project', async () => true),
    ).resolves.toBeUndefined();
  });

  it('refuses a scan that would spend a free-tier project’s daily read quota', async () => {
    await expect(assertSourceBillingEnabled('some-project', async () => false)).rejects.toThrow(
      /some-project.*billing/,
    );
  });

  it('refuses when billing cannot be checked', async () => {
    await expect(
      assertSourceBillingEnabled('some-project', async () => {
        throw new Error('HTTP 403');
      }),
    ).rejects.toThrow('HTTP 403');
  });
});

describe('IMPORT_SOURCES', () => {
  it('reads each provider from the product that holds it', () => {
    expect(IMPORT_SOURCES.AA).toMatchObject({
      project: 'recovery-connect-cad4b',
      collection: 'meetings',
    });
    expect(IMPORT_SOURCES.NA).toMatchObject({
      project: 'phoenix-cleanhouse',
      collection: 'na-meetings',
    });
  });
});

describe('readSnapshotPages', () => {
  const UPDATE_TIME = { toDate: () => new Date('2023-03-19T15:10:57Z') };

  function makeSource(pages: Array<Array<Record<string, unknown>>>) {
    const cursors: unknown[] = [];
    let call = 0;
    const query = {
      orderBy: () => query,
      limit: () => query,
      startAfter: (cursor: unknown) => {
        cursors.push(cursor);
        return query;
      },
      get: async () => {
        const docs = (pages[call++] ?? []).map((data, i) => ({
          id: `doc-${call}-${i}`,
          data: () => data,
          updateTime: UPDATE_TIME,
        }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
    return {
      db: { collection: () => query } as unknown as FirebaseFirestore.Firestore,
      cursors,
    };
  }

  async function collect(db: FirebaseFirestore.Firestore, pageSize: number) {
    const pages = [];
    for await (const page of readSnapshotPages(db, 'meetings', pageSize)) pages.push(page);
    return pages;
  }

  it('pages through the collection using the last doc of each page as the cursor', async () => {
    const { db, cursors } = makeSource([[{ a: 1 }, { a: 2 }], [{ a: 3 }]]);

    const pages = await collect(db, 2);

    expect(pages.map((p) => p.length)).toEqual([2, 1]);
    expect(cursors).toHaveLength(1);
    expect((cursors[0] as { id: string }).id).toBe('doc-1-1');
  });

  it('dates a row by its own updatedAt when it has one', async () => {
    const updatedAt = { toDate: () => new Date('2025-09-17T04:24:33Z') };
    const { db } = makeSource([[{ updatedAt }]]);

    const [[doc]] = await collect(db, 2);

    expect(doc.asOf.toISOString().slice(0, 10)).toBe('2025-09-17');
  });

  it('falls back to the document write time when the row has no updatedAt', async () => {
    const { db } = makeSource([[{ name: 'x' }]]);

    const [[doc]] = await collect(db, 2);

    expect(doc.asOf.toISOString().slice(0, 10)).toBe('2023-03-19');
  });

  it('yields nothing for an empty collection', async () => {
    const { db } = makeSource([[]]);

    expect(await collect(db, 2)).toEqual([]);
  });
});
