/**
 * HouseIssue Entity Unit Tests
 *
 * Covers:
 *   - IssueStatus enum values
 *   - getIssueStatus() legacy-compatibility logic
 *   - getIssueStatus() with explicit status field
 */

// Mock display util — getCurrentTime is called in the HouseIssue constructor
jest.mock('../../util/display', () => ({
  getCurrentTime: jest.fn(() => '2024-01-01T00:00:00.000Z'),
}));

import { HouseIssue, IssueStatus, getIssueStatus } from '../Issue';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeIssue(overrides: Partial<HouseIssue> = {}): HouseIssue {
  const issue = new HouseIssue(
    'issue-1',
    'house',
    'some description',
    'user-1',
  );
  return Object.assign(issue, overrides);
}

// ─── IssueStatus enum ────────────────────────────────────────────────────────

describe('IssueStatus enum', () => {
  it('has the correct string values', () => {
    expect(IssueStatus.OPEN).toBe('open');
    expect(IssueStatus.IN_PROGRESS).toBe('in_progress');
    expect(IssueStatus.RESOLVED).toBe('resolved');
    expect(IssueStatus.DISMISSED).toBe('dismissed');
  });
});

// ─── HouseIssue defaults ─────────────────────────────────────────────────────

describe('HouseIssue defaults', () => {
  it('sets status to OPEN on construction', () => {
    const issue = new HouseIssue(
      'i1',
      'maintenance',
      'leaky faucet',
      'admin-1',
    );
    expect(issue.status).toBe(IssueStatus.OPEN);
  });

  it('sets invalid to false on construction', () => {
    const issue = new HouseIssue('i1', 'house', 'noise complaint', 'user-1');
    expect(issue.invalid).toBe(false);
  });

  it('sets resolution to empty string on construction', () => {
    const issue = new HouseIssue('i1', 'guest', 'guest issue', 'admin-1');
    expect(issue.resolution).toBe('');
  });
});

// ─── HouseIssue timestamp fields ─────────────────────────────────────────────

describe('HouseIssue timestamp fields', () => {
  it('sets createdAt (not createdDate) in constructor', () => {
    const issue = new HouseIssue('i1', 'house', 'desc', 'admin-1');
    const ownKeys = Object.getOwnPropertyNames(issue);
    expect(ownKeys).not.toContain('createdDate');
    expect(typeof issue.createdAt).toBe('string');
  });
});

// ─── getIssueStatus — explicit status field ───────────────────────────────────

describe('getIssueStatus — explicit status field', () => {
  it('returns OPEN when status is explicitly OPEN', () => {
    const issue = makeIssue({ status: IssueStatus.OPEN });
    expect(getIssueStatus(issue)).toBe(IssueStatus.OPEN);
  });

  it('returns IN_PROGRESS when status is explicitly IN_PROGRESS', () => {
    const issue = makeIssue({ status: IssueStatus.IN_PROGRESS });
    expect(getIssueStatus(issue)).toBe(IssueStatus.IN_PROGRESS);
  });

  it('returns RESOLVED when status is explicitly RESOLVED', () => {
    const issue = makeIssue({ status: IssueStatus.RESOLVED });
    expect(getIssueStatus(issue)).toBe(IssueStatus.RESOLVED);
  });

  it('returns DISMISSED when status is explicitly DISMISSED', () => {
    const issue = makeIssue({ status: IssueStatus.DISMISSED });
    expect(getIssueStatus(issue)).toBe(IssueStatus.DISMISSED);
  });

  it('prefers explicit status over legacy invalid flag', () => {
    const issue = makeIssue({ status: IssueStatus.OPEN, invalid: true });
    expect(getIssueStatus(issue)).toBe(IssueStatus.OPEN);
  });

  it('prefers explicit status over legacy resolution string', () => {
    const issue = makeIssue({
      status: IssueStatus.OPEN,
      resolution: 'fixed it',
    });
    expect(getIssueStatus(issue)).toBe(IssueStatus.OPEN);
  });
});

// ─── getIssueStatus — legacy issues (no status field) ────────────────────────

describe('getIssueStatus — legacy issues without a status field', () => {
  function makeLegacyIssue(overrides: Partial<HouseIssue> = {}): HouseIssue {
    // Simulate an issue that was deserialized from Firestore before the status
    // field existed: cast away the status so it is falsy (empty string default
    // triggers the legacy branch).
    const issue = makeIssue(overrides);
    (issue as any).status = '';
    return issue;
  }

  it('returns OPEN when neither invalid nor resolution is set', () => {
    const issue = makeLegacyIssue({ invalid: false, resolution: '' });
    expect(getIssueStatus(issue)).toBe(IssueStatus.OPEN);
  });

  it('returns DISMISSED when invalid is true', () => {
    const issue = makeLegacyIssue({ invalid: true, resolution: '' });
    expect(getIssueStatus(issue)).toBe(IssueStatus.DISMISSED);
  });

  it('returns RESOLVED when resolution is a non-empty string', () => {
    const issue = makeLegacyIssue({
      invalid: false,
      resolution: 'fixed the pipe',
    });
    expect(getIssueStatus(issue)).toBe(IssueStatus.RESOLVED);
  });

  it('prefers DISMISSED (invalid) over RESOLVED (resolution) for legacy issues', () => {
    // Edge case: both invalid=true and resolution set
    const issue = makeLegacyIssue({ invalid: true, resolution: 'also fixed' });
    expect(getIssueStatus(issue)).toBe(IssueStatus.DISMISSED);
  });

  it('returns OPEN when resolution is null (legacy null from Firestore)', () => {
    const issue = makeLegacyIssue({ invalid: false });
    (issue as any).resolution = null;
    expect(getIssueStatus(issue)).toBe(IssueStatus.OPEN);
  });
});
