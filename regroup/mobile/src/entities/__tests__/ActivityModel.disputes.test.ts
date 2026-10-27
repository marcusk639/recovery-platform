/**
 * Dispute helpers on the Activity model: the "Successfully disputed" badge
 * comes from the counting rule (so it disappears while a reopened dispute is
 * pending), an older build's "delete" is recognised for an undo, and any
 * dispute history (incl. `resolved` alone, or a reopen) blocks deletion.
 */
import {
  ActivityStatus,
  hasDisputeHistory,
  isLegacyUpheld,
  isSuccessfullyDisputed,
} from '../ActivityModel';

describe('isSuccessfullyDisputed', () => {
  it('is a decided dispute that does not count', () => {
    expect(
      isSuccessfullyDisputed({
        status: ActivityStatus.RESOLVED,
        incomplete: true,
        disputed: 'successful',
      }),
    ).toBe(true);
  });

  it("is not a pending (reopened) dispute, nor a decided one that counts, even with disputed 'successful'", () => {
    expect(
      isSuccessfullyDisputed({
        status: ActivityStatus.DISPUTED,
        incomplete: null,
        reopenedBy: 'mgr',
      }),
    ).toBe(false);
    expect(
      isSuccessfullyDisputed({
        status: ActivityStatus.RESOLVED,
        disputed: 'successful',
        incomplete: false,
      }),
    ).toBe(false);
    expect(
      isSuccessfullyDisputed({
        status: ActivityStatus.RESOLVED,
        disputed: 'rejected',
        incomplete: false,
      }),
    ).toBe(false);
  });
});

describe('isLegacyUpheld', () => {
  const at = '2026-01-15T10:00:00.000Z';
  it("is an older build's delete: deleted, resolved at loggedAt (Timestamps or strings)", () => {
    const ts = { toMillis: () => Date.parse(at) };
    expect(isLegacyUpheld({ status: 'deleted', disputeResolvedAt: at, loggedAt: at })).toBe(true);
    expect(isLegacyUpheld({ status: 'deleted', disputeResolvedAt: ts, loggedAt: ts })).toBe(true);
  });

  it('is not a plain deletion or a later withdrawal', () => {
    expect(isLegacyUpheld({ status: 'deleted', loggedAt: at })).toBe(false);
    expect(
      isLegacyUpheld({
        status: 'deleted',
        disputeResolvedAt: at,
        loggedAt: '2026-01-16T10:00:00.000Z',
      }),
    ).toBe(false);
    expect(isLegacyUpheld({ status: 'resolved', disputeResolvedAt: at, loggedAt: at })).toBe(false);
  });
});

describe('hasDisputeHistory', () => {
  it('includes `resolved` alone, a reopen, and disputedAt', () => {
    expect(hasDisputeHistory({ status: ActivityStatus.RESOLVED })).toBe(true);
    expect(hasDisputeHistory({ status: ActivityStatus.ACTIVE, reopenedBy: 'mgr' })).toBe(true);
    expect(hasDisputeHistory({ status: ActivityStatus.ACTIVE, disputedAt: 'x' })).toBe(true);
  });

  it("ignores a never-disputed activity (incl. an older build's disputeResult 'none')", () => {
    expect(
      hasDisputeHistory({
        status: ActivityStatus.ACTIVE,
        disputeResult: 'none',
        disputedBy: undefined,
      }),
    ).toBe(false);
  });
});
