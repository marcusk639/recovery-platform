import fs from 'fs';
import path from 'path';
import { MeetingGuideAccessError } from '../lib/meetings/meetingSync';
import {
  ACCESS_EXIT_CODE,
  describeResult,
  parseSyncArgs,
  progressLine,
  readApiKey,
  reportFatal,
  syncEnvFile,
} from './syncMeetings';

jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(),
  initializeApp: jest.fn(),
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__serverTimestamp__' },
  Timestamp: { fromMillis: jest.fn() },
  getFirestore: jest.fn(),
}));

const SPOT = { s: 34, n: 34.0001, w: -118.3001, e: -118.3 };

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
  it('returns a key that is already URL-encoded exactly as set', () => {
    expect(readApiKey({ MEETING_GUIDE_API_KEY: 'abc%253fdef' })).toBe('abc%253fdef');
  });

  it('encodes a key set in its issued form, so %3f reaches the API as %3f and not ?', () => {
    expect(readApiKey({ MEETING_GUIDE_API_KEY: 'abc%3fdef%3fg' })).toBe('abc%253fdef%253fg');
  });

  it('fails clearly when the key is missing', () => {
    expect(() => readApiKey({})).toThrow(/MEETING_GUIDE_API_KEY/);
  });

  it('reports a missing key the same way as a rejected one', () => {
    expect(() => readApiKey({})).toThrow(MeetingGuideAccessError);
  });
});

describe('syncEnvFile', () => {
  // A deploy sets every entry of an env file in its source folder on every function, and
  // uploads the folder, so a key kept there would ship with recovery-api.
  it('sits outside the folder a recovery-api deploy uploads', () => {
    const recoveryApi = path.resolve(__dirname, '../..');
    const firebase = JSON.parse(fs.readFileSync(path.join(recoveryApi, 'firebase.json'), 'utf8'));
    const deployed = path.resolve(recoveryApi, firebase.functions[0].source);
    const fromDeployed = path.relative(deployed, syncEnvFile());
    expect(fromDeployed.startsWith('..') || path.isAbsolute(fromDeployed)).toBe(true);
  });

  it('is the same file for every checkout and worktree, under the home directory', () => {
    expect(syncEnvFile('/home/someone')).toBe(
      '/home/someone/.config/recovery-platform/meeting-sync.env',
    );
  });
});

describe('reportFatal', () => {
  it('makes a key problem impossible to miss, and exits with its own code', () => {
    const printed: unknown[] = [];
    const code = reportFatal(new MeetingGuideAccessError('the key was rejected'), (line) =>
      printed.push(line),
    );
    expect(code).toBe(ACCESS_EXIT_CODE);
    expect(code).not.toBe(1);
    const output = printed.join('\n');
    expect(output).toMatch(/MEETING GUIDE SYNC FAILED: ACTION NEEDED/);
    expect(output).toMatch(/the key was rejected/);
    expect(output).toMatch(/Nothing was written/);
  });

  it('keeps ordinary failures on the general exit code', () => {
    const printed: unknown[] = [];
    const boom = new Error('boom');
    const code = reportFatal(boom, (...args) => printed.push(...args));
    expect(code).toBe(1);
    expect(printed).toContain(boom);
    expect(printed.join('\n')).not.toMatch(/ACTION NEEDED/);
  });
});

describe('progressLine', () => {
  it('shows how far through the country the sweep is', () => {
    const line = progressLine({ baseCellsDone: 250, baseCells: 1000, requests: 300, meetings: 42 });
    expect(line).toBe('syncMeetings: 25% (250/1000 cells), 300 requests, 42 meetings');
  });
});

describe('describeResult coverage', () => {
  const result = {
    sweep: {
      baseCells: 10,
      requests: 12,
      cappedResponses: 0,
      failedBaseCells: 0,
      unresolvedSpots: [],
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
    coverage: {
      byState: { FL: 3, MA: 2 },
      places: [
        { name: 'Marathon, FL', count: 3 },
        { name: 'Nantucket, MA', count: 0 },
      ],
    },
    staleAfterDays: 30,
  };

  it('prints meetings per state, so a thin state stands out', () => {
    expect(describeResult(result).join('\n')).toMatch(/by state.*"FL":3.*"MA":2/);
  });

  it('prints the count for each place to check', () => {
    expect(describeResult(result).join('\n')).toMatch(/Marathon, FL: 3/);
  });

  it('warns when the 10% limit blocked the prune, so it is not missed', () => {
    const blocked = { ...result, prune: { deleted: 0, scanned: 0, blocked: ['AA' as const] } };
    expect(describeResult(blocked).join('\n')).toMatch(/WARNING the prune was blocked for AA/);
  });

  it('warns about a place with no meetings, so a coastal gap is not silent', () => {
    expect(describeResult(result).join('\n')).toMatch(
      /WARNING no meetings found near Nantucket, MA/,
    );
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
        unresolvedSpots: [SPOT, SPOT, SPOT],
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
      coverage: { byState: {}, places: [] },
      staleAfterDays: 30,
    });
    expect(lines.join('\n')).toMatch(/3 spots hold more meetings than one response returns/);
    expect(lines.join('\n')).toMatch(/1 of 10 base cells failed/);
  });
});
