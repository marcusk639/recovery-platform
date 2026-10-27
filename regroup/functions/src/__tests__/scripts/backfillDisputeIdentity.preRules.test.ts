// src/__tests__/scripts/backfillDisputeIdentity.preRules.test.ts
//
// PR #141 round 9: the pre-rules stamp check of backfillDisputeIdentity.
// --verify-stamps uses the run's start as the cutoff; an explicit
// --rules-live-at is parsed strictly. The guest doc is read in the same
// transaction as the activity; skipped and guest-less activities and
// pre-cutoff decisions are listed by id; a flagged mismatch exits 3; review
// flags merge reasons.

jest.mock('../../scripts/scriptBootstrap', () => ({}));

import { Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore, asFirestore } from '../activities/fakeFirestore';
import { main, parseArgs, run } from '../../scripts/backfillDisputeIdentity';
import { CUTOFF_FLOOR } from '../../scripts/preRulesStamps';
import { mergeReviewFlag } from '../../activities/reviewFlag';
import { verifyStamp } from '../../activities/stampVerification';

const NOW = new Date('2026-11-01T12:00:00Z');
const BEFORE = NOW.getTime() - 60_000;
const act = (o: Record<string, unknown> = {}) => ({
  guestId: 'g1',
  houseId: 'h1',
  type: 'chore',
  status: 'active',
  loggedBy: 'mgr',
  ...o,
});
const disputed = {
  status: 'disputed',
  disputeReason: 'r',
  disputedBy: 'p',
  disputeResolvedBy: 'p',
};

let db: FakeFirestore;
let output: string[];

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('guests', 'g1', { houseId: 'h1', userId: 'res1' });
  output = [];
  jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.join(' '));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  process.exitCode = undefined;
});

describe('I-1/I-2: the cutoff', () => {
  it('--verify-stamps without --rules-live-at uses the time the run starts', () => {
    expect(parseArgs(['--verify-stamps'], NOW)).toEqual({ apply: false, rulesLiveAt: NOW });
    expect(parseArgs([], NOW)).toEqual({ apply: false });
  });

  it('accepts ISO 8601 with Z or an explicit offset only', () => {
    expect(parseArgs(['--rules-live-at', '2026-11-01T10:00:00+02:00'], NOW).rulesLiveAt).toEqual(
      new Date('2026-11-01T08:00:00Z'),
    );
    for (const bad of [
      '2026-11-01T10:00:00',
      '2026-11-01',
      'Nov 1 2026 10:00 UTC',
      '1793000000000',
    ]) {
      expect(() => parseArgs(['--rules-live-at', bad], NOW)).toThrow('ISO 8601');
    }
  });

  it('refuses a repeated flag instead of silently using the first value', () => {
    const at = '2026-11-01T10:00:00Z';
    expect(() => parseArgs(['--rules-live-at', at, '--rules-live-at', 'garbage'], NOW)).toThrow(
      '--rules-live-at given twice',
    );
    expect(() => parseArgs(['--apply', '--apply'], NOW)).toThrow('--apply given twice');
  });

  it('refuses a cutoff in the future or before the floor', () => {
    expect(() => parseArgs(['--rules-live-at', '2026-11-01T12:01:00Z'], NOW)).toThrow(
      'in the future',
    );
    expect(() => parseArgs(['--rules-live-at', '2026-09-30T23:59:59Z'], NOW)).toThrow(
      CUTOFF_FLOOR.toISOString(),
    );
  });

  it('prints the parsed cutoff in the Mode header', async () => {
    await run(asFirestore(db), { apply: false, rulesLiveAt: NOW });
    expect(output[0]).toContain(`created before ${NOW.toISOString()}`);
  });
});

describe('S-1/S-2/S-3/S-5: the report', () => {
  it('lists skipped and guest-less activities and pre-cutoff decisions by id; exit 3 on a flagged mismatch', async () => {
    const before = Date.now() - 60_000; // main() takes the real clock
    db.seed('activities', 'forged', act({ ...disputed, residentUid: 'someoneElse' }), before);
    db.seed('activities', 'noGuest', act({ guestId: 'gone', residentUid: 'x' }), before);
    db.seed('activities/forged/dispute-decisions', 'decided_1', {
      event: 'rejected',
      at: Timestamp.fromMillis(before),
    });
    db.seed('activities/forged/dispute-decisions', 'decided_2', {
      event: 'kept',
      at: Timestamp.fromMillis(before),
      backfilled: true,
    });
    await main(['--verify-stamps', '--apply'], asFirestore(db));
    const printed = output.join('\n');
    expect(printed).toContain("flagged for the owner's review: forged");
    expect(printed).toContain('Pre-rules activities with no guest doc: noGuest');
    expect(printed).toContain('not backfilled (as trusted as backfilled ones): forged/decided_1');
    expect(printed).not.toContain('decided_2');
    expect(process.exitCode).toBe(3);
  });

  it('an activity moved to another guest meanwhile is skipped, not re-derived', async () => {
    const data = act({ residentUid: 'someoneElse' });
    db.seed('activities', 'moved', { ...data, guestId: 'g2' });
    expect(await verifyStamp(asFirestore(db), 'moved', data, true)).toBe('skipped');
    expect(db.read('activities', 'moved')!.residentUid).toBe('someoneElse');
  });

  it("S-1: reads the guest doc in the transaction, so a concurrent link doesn't null out a correct stamp", async () => {
    // The scan saw the guest without an account; by the transaction it is linked.
    db.seed('guests', 'g3', { houseId: 'h1', userId: 'res3' });
    const scanned = act({ guestId: 'g3', residentUid: 'res3' });
    db.seed('activities', 'linked', scanned);
    expect(await verifyStamp(asFirestore(db), 'linked', scanned, true)).toBe('match');
    expect(db.read('activities', 'linked')!.residentUid).toBe('res3');
  });
});

describe('B3: pre-cutoff activities with no guest doc', () => {
  it('are listed by id; a disputed one is flagged stamp_unverifiable', async () => {
    db.seed('activities', 'gonePlain', act({ guestId: 'gone', residentUid: 'x' }), BEFORE);
    db.seed(
      'activities',
      'goneDisputed',
      act({ ...disputed, guestId: 'gone', residentUid: 'x' }),
      BEFORE,
    );
    const counts = await run(asFirestore(db), { apply: true, rulesLiveAt: NOW });
    expect(counts.stampGuestMissing).toBe(2);
    expect(output.join('\n')).toContain(
      'Pre-rules activities with no guest doc: goneDisputed, gonePlain',
    );
    expect(db.read('activities', 'goneDisputed')!.flaggedForReview).toEqual({
      reason: 'stamp_unverifiable',
      reasons: ['stamp_unverifiable'],
    });
    expect(db.read('activities', 'gonePlain')).not.toHaveProperty('flaggedForReview');
  });
});

describe('an activity with no guestId', () => {
  it('is "no guest doc" in both the dry run and the apply run, never "skipped"', async () => {
    const { guestId: _omit, ...data } = act({ residentUid: 'x' });
    db.seed('activities', 'noGuestId', data);
    expect(await verifyStamp(asFirestore(db), 'noGuestId', data, false)).toBe('guestMissing');
    expect(await verifyStamp(asFirestore(db), 'noGuestId', data, true)).toBe('guestMissing');
  });
});

describe('S-4: review flags merge reasons', () => {
  it('keeps the first flag and appends a new reason once', () => {
    const first = { reason: 'self_decision', event: 'rejected', decisionId: 'd' };
    const merged = mergeReviewFlag(first, { reason: 'stamp_mismatch' });
    expect(merged).toEqual({ ...first, reasons: ['self_decision', 'stamp_mismatch'] });
    expect(mergeReviewFlag(merged, { reason: 'stamp_mismatch' })).toBeNull();
    expect(mergeReviewFlag(undefined, { reason: 'stamp_mismatch' })).toEqual({
      reason: 'stamp_mismatch',
      reasons: ['stamp_mismatch'],
    });
  });

  it('the backfill keeps an existing self_decision flag and adds stamp_mismatch', async () => {
    db.seed(
      'activities',
      'both',
      act({
        ...disputed,
        residentUid: 'someoneElse',
        flaggedForReview: { reason: 'self_decision' },
      }),
      BEFORE,
    );
    await run(asFirestore(db), { apply: true, rulesLiveAt: NOW });
    expect(db.read('activities', 'both')!.flaggedForReview).toEqual({
      reason: 'self_decision',
      reasons: ['self_decision', 'stamp_mismatch'],
    });
  });
});
