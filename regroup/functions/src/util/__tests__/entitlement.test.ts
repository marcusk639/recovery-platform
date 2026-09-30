import { evaluateEntitlement, assertHouseEntitled, ENTITLED_STATUSES } from '../entitlement';

const NOW = Date.parse('2026-09-29T12:00:00.000Z');
const IN_AN_HOUR = new Date(NOW + 60 * 60 * 1000).toISOString();
const AN_HOUR_AGO = new Date(NOW - 60 * 60 * 1000).toISOString();

describe('evaluateEntitlement', () => {
  it.each(ENTITLED_STATUSES)('grants access for %s', (status) => {
    expect(evaluateEntitlement({ subscriptionStatus: status }, NOW)).toMatchObject({
      entitled: true,
    });
  });

  it.each(['canceled', 'unpaid'])('denies access for %s', (status) => {
    expect(evaluateEntitlement({ subscriptionStatus: status }, NOW)).toMatchObject({
      entitled: false,
      reason: status,
    });
  });

  describe('past_due grace window', () => {
    it('grants access while the grace window is open', () => {
      expect(
        evaluateEntitlement({ subscriptionStatus: 'past_due', guestGraceEndsAt: IN_AN_HOUR }, NOW),
      ).toMatchObject({ entitled: true, reason: 'grace' });
    });

    it('denies access once the grace window has closed', () => {
      expect(
        evaluateEntitlement({ subscriptionStatus: 'past_due', guestGraceEndsAt: AN_HOUR_AGO }, NOW),
      ).toMatchObject({ entitled: false, reason: 'expired_grace' });
    });

    it('denies access when past_due carries no grace window at all', () => {
      // Absent guestGraceEndsAt must not read as an unbounded grace period.
      expect(evaluateEntitlement({ subscriptionStatus: 'past_due' }, NOW)).toMatchObject({
        entitled: false,
        reason: 'expired_grace',
      });
    });

    it('denies access when the grace timestamp is unparseable', () => {
      expect(
        evaluateEntitlement(
          { subscriptionStatus: 'past_due', guestGraceEndsAt: 'not-a-date' },
          NOW,
        ),
      ).toMatchObject({ entitled: false, reason: 'expired_grace' });
    });
  });

  describe('absent status (Phase A: measure before enforcing)', () => {
    it.each([undefined, '', null])('grants access but flags the gap for %p', (status) => {
      expect(
        evaluateEntitlement({ subscriptionStatus: status as string | undefined }, NOW),
      ).toEqual({ entitled: true, reason: 'absent_status' });
    });
  });

  it('denies an unrecognized status rather than assuming it is fine', () => {
    expect(evaluateEntitlement({ subscriptionStatus: 'surprise' }, NOW)).toMatchObject({
      entitled: false,
      reason: 'unknown_status',
    });
  });
});

describe('assertHouseEntitled', () => {
  it('returns the verdict when entitled', () => {
    expect(assertHouseEntitled({ subscriptionStatus: 'active' }, 'house-1', NOW)).toMatchObject({
      entitled: true,
    });
  });

  it('throws failed-precondition when not entitled', () => {
    // Asserted via catch rather than toThrow(objectContaining(...)): that form
    // passes even when the expected code is wrong, so it asserts nothing.
    let caught: { code?: string } | undefined;
    try {
      assertHouseEntitled({ subscriptionStatus: 'canceled' }, 'house-1', NOW);
    } catch (err) {
      caught = err as { code?: string };
    }
    expect(caught?.code).toBe('failed-precondition');
  });

  it('does not throw for an absent status while Phase A is in force', () => {
    expect(() => assertHouseEntitled({}, 'house-1', NOW)).not.toThrow();
  });
});
