import { describeResult, parseSyncArgs, progressLine, readApiKey } from './syncMeetings';

jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(),
  initializeApp: jest.fn(),
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__serverTimestamp__' },
  Timestamp: { fromMillis: jest.fn() },
  getFirestore: jest.fn(),
}));

describe('parseSyncArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseSyncArgs([])).toEqual({ apply: false });
  });

  it('writes only with an explicit --apply', () => {
    expect(parseSyncArgs(['--apply'])).toEqual({ apply: true });
  });

  it('rejects an unknown flag, so a typo of --apply cannot pass silently', () => {
    expect(() => parseSyncArgs(['--aply'])).toThrow(/--aply/);
  });
});

describe('readApiKey', () => {
  it('returns the key exactly as set', () => {
    expect(readApiKey({ MEETING_GUIDE_API_KEY: 'abc%253fdef' })).toBe('abc%253fdef');
  });

  it('fails clearly when the key is missing', () => {
    expect(() => readApiKey({})).toThrow(/MEETING_GUIDE_API_KEY/);
  });
});

describe('progressLine', () => {
  it('shows how far through the country the sweep is', () => {
    const line = progressLine({ baseCellsDone: 250, baseCells: 1000, requests: 300, meetings: 42 });
    expect(line).toBe('syncMeetings: 25% (250/1000 cells), 300 requests, 42 meetings');
  });
});

describe('describeResult', () => {
  it('flags spots the sweep could not fully read, so a gap is not silent', () => {
    const lines = describeResult({
      sweep: {
        baseCells: 10,
        requests: 12,
        cappedResponses: 2,
        failedBaseCells: 1,
        unresolvedCells: 3,
        droppedNonUs: 0,
        rateLimited: 0,
        meetings: 5,
      },
      reconcile: {
        created: 5,
        updated: 0,
        replaced: 0,
        restamped: 0,
        unchanged: 0,
        collapsedDuplicates: 0,
        unmappable: 0,
        skippedAppOwned: 0,
      },
      staleAfterDays: 30,
    });
    expect(lines.join('\n')).toMatch(/3 spots hold more meetings than one response returns/);
    expect(lines.join('\n')).toMatch(/1 of 10 base cells failed/);
  });
});
