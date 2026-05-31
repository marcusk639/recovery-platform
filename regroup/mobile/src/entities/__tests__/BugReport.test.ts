// BugReport imports getCurrentTime from util/display, which uses moment-timezone.
// We mock it to avoid complex timezone setup and keep tests deterministic.
jest.mock('../../util/display', () => ({
  getCurrentTime: jest.fn(() => '2026-02-22T10:00:00.000Z'),
}));

import { BugReport } from '../BugReport';

describe('BugReport class', () => {
  it('can be instantiated with description and reporter', () => {
    const report = new BugReport('App crashes on login', 'user-123');
    expect(report).toBeInstanceOf(BugReport);
  });

  it('sets description correctly', () => {
    const report = new BugReport('UI glitch on home screen', 'user-456');
    expect(report.description).toBe('UI glitch on home screen');
  });

  it('sets reporter correctly', () => {
    const report = new BugReport('Network error', 'user-789');
    expect(report.reporter).toBe('user-789');
  });

  it('does not set deprecated createdDate (use createdAt instead)', () => {
    const report = new BugReport('Some bug', 'user-abc');
    expect(report.createdDate).toBeUndefined();
  });

  it('description defaults to empty string before constructor override', () => {
    const report = new BugReport('', 'user-001');
    expect(report.description).toBe('');
  });

  it('reporter defaults to empty string before constructor override', () => {
    const report = new BugReport('desc', '');
    expect(report.reporter).toBe('');
  });

  it('inherits id from BaseEntity with empty string default', () => {
    const report = new BugReport('Bug desc', 'user-001');
    expect(report.id).toBe('');
  });

  it('inherits createdAt from BaseEntity as an ISO string', () => {
    const report = new BugReport('Bug desc', 'user-001');
    expect(typeof report.createdAt).toBe('string');
    expect(new Date(report.createdAt).toISOString()).toBe(report.createdAt);
  });

  it('inherits updatedAt from BaseEntity as an ISO string', () => {
    const report = new BugReport('Bug desc', 'user-001');
    expect(typeof report.updatedAt).toBe('string');
    expect(new Date(report.updatedAt).toISOString()).toBe(report.updatedAt);
  });

  it('allows id to be set after construction', () => {
    const report = new BugReport('Bug desc', 'user-001');
    report.id = 'doc-id-123';
    expect(report.id).toBe('doc-id-123');
  });

  it('allows description to be updated after construction', () => {
    const report = new BugReport('Initial description', 'user-001');
    report.description = 'Updated description';
    expect(report.description).toBe('Updated description');
  });

  it('two BugReports with different reporters are independent objects', () => {
    const r1 = new BugReport('Bug A', 'user-001');
    const r2 = new BugReport('Bug B', 'user-002');
    expect(r1.reporter).not.toBe(r2.reporter);
    expect(r1.description).not.toBe(r2.description);
  });

  it('uid is undefined by default (optional legacy field)', () => {
    const report = new BugReport('Bug desc', 'user-001');
    expect(report.uid).toBeUndefined();
  });

  it('createdBy is undefined by default', () => {
    const report = new BugReport('Bug desc', 'user-001');
    expect(report.createdBy).toBeUndefined();
  });

  it('description accepts a long multi-line string', () => {
    const longDesc =
      'Line 1\nLine 2\nLine 3\nSteps to reproduce:\n1. Open app\n2. Tap login';
    const report = new BugReport(longDesc, 'user-999');
    expect(report.description).toBe(longDesc);
  });
});
