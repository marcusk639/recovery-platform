/**
 * Utility function tests for src/util/issues.ts
 *
 * Covers:
 *   - filterIssuesByStatus()
 *   - getOpenIssueCount()
 *   - getSortedIssues()
 */

// Mock display util so HouseIssue constructor does not blow up
jest.mock('../../util/display', () => ({
  getCurrentTime: jest.fn(() => '2024-01-01T00:00:00.000Z'),
}));

import { HouseIssue, IssueStatus, Issues } from '../../entities/Issue';
import {
  filterIssuesByStatus,
  getOpenIssueCount,
  getSortedIssues,
} from '../issues';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeIssue(
  id: string,
  status: IssueStatus,
  overrides: Partial<HouseIssue> = {},
): HouseIssue {
  const issue = new HouseIssue(id, 'house', 'description', 'user-1');
  issue.status = status;
  return Object.assign(issue, overrides);
}

function makeLegacyIssue(
  id: string,
  opts: { invalid?: boolean; resolution?: string } = {},
): HouseIssue {
  const issue = new HouseIssue(id, 'house', 'description', 'user-1');
  (issue as any).status = ''; // simulate no status field
  issue.invalid = opts.invalid ?? false;
  issue.resolution = opts.resolution ?? '';
  return issue;
}

// ─── filterIssuesByStatus ────────────────────────────────────────────────────

describe('filterIssuesByStatus', () => {
  it('returns only issues matching the requested status', () => {
    const issues: Issues = {
      i1: makeIssue('i1', IssueStatus.OPEN),
      i2: makeIssue('i2', IssueStatus.RESOLVED),
      i3: makeIssue('i3', IssueStatus.OPEN),
      i4: makeIssue('i4', IssueStatus.DISMISSED),
    };

    const open = filterIssuesByStatus(issues, IssueStatus.OPEN);
    expect(open).toHaveLength(2);
    expect(open.map(i => i.id).sort()).toEqual(['i1', 'i3']);
  });

  it('returns empty array when no issues match', () => {
    const issues: Issues = {
      i1: makeIssue('i1', IssueStatus.OPEN),
    };
    expect(filterIssuesByStatus(issues, IssueStatus.IN_PROGRESS)).toHaveLength(0);
  });

  it('returns all issues when all match', () => {
    const issues: Issues = {
      i1: makeIssue('i1', IssueStatus.RESOLVED),
      i2: makeIssue('i2', IssueStatus.RESOLVED),
    };
    expect(filterIssuesByStatus(issues, IssueStatus.RESOLVED)).toHaveLength(2);
  });

  it('returns empty array for empty issues record', () => {
    expect(filterIssuesByStatus({}, IssueStatus.OPEN)).toHaveLength(0);
  });

  it('handles legacy issues correctly (no explicit status field)', () => {
    const issues: Issues = {
      legacy_open: makeLegacyIssue('legacy_open', { invalid: false, resolution: '' }),
      legacy_resolved: makeLegacyIssue('legacy_resolved', { resolution: 'all good' }),
      legacy_dismissed: makeLegacyIssue('legacy_dismissed', { invalid: true }),
    };

    expect(filterIssuesByStatus(issues, IssueStatus.OPEN)).toHaveLength(1);
    expect(filterIssuesByStatus(issues, IssueStatus.RESOLVED)).toHaveLength(1);
    expect(filterIssuesByStatus(issues, IssueStatus.DISMISSED)).toHaveLength(1);
  });
});

// ─── getOpenIssueCount ───────────────────────────────────────────────────────

describe('getOpenIssueCount', () => {
  it('counts only OPEN issues', () => {
    const issues: Issues = {
      i1: makeIssue('i1', IssueStatus.OPEN),
      i2: makeIssue('i2', IssueStatus.RESOLVED),
      i3: makeIssue('i3', IssueStatus.OPEN),
      i4: makeIssue('i4', IssueStatus.DISMISSED),
    };
    expect(getOpenIssueCount(issues)).toBe(2);
  });

  it('returns 0 when all issues are resolved', () => {
    const issues: Issues = {
      i1: makeIssue('i1', IssueStatus.RESOLVED),
      i2: makeIssue('i2', IssueStatus.DISMISSED),
    };
    expect(getOpenIssueCount(issues)).toBe(0);
  });

  it('returns 0 for empty issues record', () => {
    expect(getOpenIssueCount({})).toBe(0);
  });

  it('counts legacy OPEN issues (no explicit status field)', () => {
    const issues: Issues = {
      legacy: makeLegacyIssue('legacy', { invalid: false, resolution: '' }),
      resolved: makeLegacyIssue('resolved', { resolution: 'done' }),
    };
    expect(getOpenIssueCount(issues)).toBe(1);
  });

  it('returns total count when all issues are OPEN', () => {
    const issues: Issues = {
      i1: makeIssue('i1', IssueStatus.OPEN),
      i2: makeIssue('i2', IssueStatus.OPEN),
      i3: makeIssue('i3', IssueStatus.OPEN),
    };
    expect(getOpenIssueCount(issues)).toBe(3);
  });
});

// ─── getSortedIssues ─────────────────────────────────────────────────────────

describe('getSortedIssues', () => {
  it('puts OPEN issues before RESOLVED issues', () => {
    const issues: Issues = {
      i_resolved: makeIssue('i_resolved', IssueStatus.RESOLVED),
      i_open: makeIssue('i_open', IssueStatus.OPEN),
    };
    const sorted = getSortedIssues(issues);
    expect(sorted[0].id).toBe('i_open');
    expect(sorted[1].id).toBe('i_resolved');
  });

  it('sorts in order: OPEN → IN_PROGRESS → RESOLVED → DISMISSED', () => {
    const issues: Issues = {
      d: makeIssue('d', IssueStatus.DISMISSED),
      r: makeIssue('r', IssueStatus.RESOLVED),
      ip: makeIssue('ip', IssueStatus.IN_PROGRESS),
      o: makeIssue('o', IssueStatus.OPEN),
    };
    const sorted = getSortedIssues(issues);
    expect(sorted.map(i => i.status)).toEqual([
      IssueStatus.OPEN,
      IssueStatus.IN_PROGRESS,
      IssueStatus.RESOLVED,
      IssueStatus.DISMISSED,
    ]);
  });

  it('within same status, sorts newest first by createdAt', () => {
    const issues: Issues = {
      older: makeIssue('older', IssueStatus.OPEN, { createdAt: '2024-01-01T00:00:00.000Z' }),
      newer: makeIssue('newer', IssueStatus.OPEN, { createdAt: '2024-06-15T00:00:00.000Z' }),
    };
    const sorted = getSortedIssues(issues);
    expect(sorted[0].id).toBe('newer');
    expect(sorted[1].id).toBe('older');
  });

  it('returns empty array for empty issues record', () => {
    expect(getSortedIssues({})).toEqual([]);
  });

  it('handles a single issue', () => {
    const issues: Issues = {
      i1: makeIssue('i1', IssueStatus.OPEN),
    };
    expect(getSortedIssues(issues)).toHaveLength(1);
  });

  it('handles legacy issues in sorting correctly', () => {
    const issues: Issues = {
      legacy_resolved: makeLegacyIssue('legacy_resolved', { resolution: 'done' }),
      legacy_open: makeLegacyIssue('legacy_open', {}),
      new_open: makeIssue('new_open', IssueStatus.OPEN),
    };
    const sorted = getSortedIssues(issues);
    // Both open issues should come before the resolved one
    const statuses = sorted.map(i => {
      const { getIssueStatus: fn } = require('../../entities/Issue');
      return fn(i);
    });
    const resolvedIdx = statuses.indexOf(IssueStatus.RESOLVED);
    const openIndices = statuses
      .map((s: IssueStatus, idx: number) => (s === IssueStatus.OPEN ? idx : -1))
      .filter((idx: number) => idx !== -1);
    openIndices.forEach((idx: number) => expect(idx).toBeLessThan(resolvedIdx));
  });
});
