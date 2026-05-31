jest.mock('../../util/display', () => ({
  getCurrentTime: jest.fn(() => '2026-02-22T10:00:00.000Z'),
}));

import {
  HouseIssue,
  IssueStatus,
  MaintenanceIssue,
  getIssueStatus,
} from '../Issue';
import type { HouseIssueType } from '../Issue';

describe('IssueStatus enum', () => {
  it('OPEN equals "open"', () => {
    expect(IssueStatus.OPEN).toBe('open');
  });

  it('IN_PROGRESS equals "in_progress"', () => {
    expect(IssueStatus.IN_PROGRESS).toBe('in_progress');
  });

  it('RESOLVED equals "resolved"', () => {
    expect(IssueStatus.RESOLVED).toBe('resolved');
  });

  it('DISMISSED equals "dismissed"', () => {
    expect(IssueStatus.DISMISSED).toBe('dismissed');
  });

  it('has exactly 4 status values', () => {
    const values = Object.values(IssueStatus);
    expect(values).toHaveLength(4);
  });
});

describe('HouseIssue class constructor', () => {
  it('can be instantiated with required arguments', () => {
    const issue = new HouseIssue(
      'id-1',
      'maintenance',
      'Leaky faucet',
      'admin-1',
    );
    expect(issue).toBeInstanceOf(HouseIssue);
  });

  it('sets id correctly', () => {
    const issue = new HouseIssue(
      'issue-42',
      'maintenance',
      'Broken door',
      'admin-2',
    );
    expect(issue.id).toBe('issue-42');
  });

  it('sets type correctly for "maintenance"', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-1');
    expect(issue.type).toBe('maintenance');
  });

  it('sets type correctly for "house"', () => {
    const issue = new HouseIssue('id-2', 'house', 'desc', 'admin-1');
    expect(issue.type).toBe('house');
  });

  it('sets type correctly for "guest"', () => {
    const issue = new HouseIssue('id-3', 'guest', 'desc', 'guest-1');
    expect(issue.type).toBe('guest');
  });

  it('sets description correctly', () => {
    const issue = new HouseIssue(
      'id-1',
      'maintenance',
      'Hot water heater broken',
      'admin-1',
    );
    expect(issue.description).toBe('Hot water heater broken');
  });

  it('sets issuer correctly', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-999');
    expect(issue.issuer).toBe('admin-999');
  });

  it('emergency defaults to false when not provided', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-1');
    expect(issue.emergency).toBe(false);
  });

  it('emergency can be set to true', () => {
    const issue = new HouseIssue(
      'id-1',
      'maintenance',
      'GAS LEAK!',
      'admin-1',
      true,
    );
    expect(issue.emergency).toBe(true);
  });

  it('status defaults to IssueStatus.OPEN', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-1');
    expect(issue.status).toBe(IssueStatus.OPEN);
  });

  it('resolution defaults to empty string', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-1');
    expect(issue.resolution).toBe('');
  });

  it('resolver defaults to empty string', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-1');
    expect(issue.resolver).toBe('');
  });

  it('invalid defaults to false', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-1');
    expect(issue.invalid).toBe(false);
  });

  it('houseId defaults to empty string', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-1');
    expect(issue.houseId).toBe('');
  });

  it('sets createdAt (not createdDate) in constructor', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-1');
    expect(issue.createdAt).toBe('2026-02-22T10:00:00.000Z');
    expect((issue as any).createdDate).toBeUndefined();
  });
});

describe('getIssueStatus function', () => {
  it('returns the issue.status directly when it is set', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-1');
    issue.status = IssueStatus.IN_PROGRESS;
    expect(getIssueStatus(issue)).toBe(IssueStatus.IN_PROGRESS);
  });

  it('returns IssueStatus.DISMISSED when invalid is true (legacy)', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-1');
    (issue as any).status = undefined;
    issue.invalid = true;
    expect(getIssueStatus(issue)).toBe(IssueStatus.DISMISSED);
  });

  it('returns IssueStatus.RESOLVED when resolution is non-empty (legacy)', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-1');
    (issue as any).status = undefined;
    issue.resolution = 'Fixed the leak';
    expect(getIssueStatus(issue)).toBe(IssueStatus.RESOLVED);
  });

  it('returns IssueStatus.OPEN as fallback when no status/invalid/resolution', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-1');
    (issue as any).status = undefined;
    expect(getIssueStatus(issue)).toBe(IssueStatus.OPEN);
  });

  it('prefers status field over invalid flag (status takes priority)', () => {
    const issue = new HouseIssue('id-1', 'maintenance', 'desc', 'admin-1');
    issue.status = IssueStatus.RESOLVED;
    issue.invalid = true;
    expect(getIssueStatus(issue)).toBe(IssueStatus.RESOLVED);
  });
});

describe('MaintenanceIssue class', () => {
  it('can be instantiated as a subclass of HouseIssue', () => {
    const issue = new MaintenanceIssue(
      'maint-1',
      'maintenance',
      'Roof repair',
      'admin-1',
    );
    expect(issue).toBeInstanceOf(MaintenanceIssue);
    expect(issue).toBeInstanceOf(HouseIssue);
  });

  it('inherits all HouseIssue behavior', () => {
    const issue = new MaintenanceIssue(
      'maint-1',
      'maintenance',
      'Heater broken',
      'admin-1',
      true,
    );
    expect(issue.type).toBe('maintenance');
    expect(issue.description).toBe('Heater broken');
    expect(issue.emergency).toBe(true);
    expect(issue.status).toBe(IssueStatus.OPEN);
  });
});
