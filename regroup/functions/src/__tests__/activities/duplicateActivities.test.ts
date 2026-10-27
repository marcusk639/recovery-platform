// src/__tests__/activities/duplicateActivities.test.ts
//
// Report-only detector for the retries the bug caused (save → "Could not
// save" → tap again). Same guest + type + equal data within 10 minutes.

import {
  DUPLICATE_WINDOW_MINUTES,
  findSuspectedDuplicates,
} from '../../activities/duplicateActivities';

const at = (iso: string) => ({ toDate: () => new Date(iso) });
const a = (id: string, timestamp: string, extra: Record<string, unknown> = {}) => ({
  id,
  data: {
    guestId: 'g1',
    type: 'medication',
    status: 'active',
    data: { medicationName: 'x', dose: 1 },
    timestamp: at(timestamp),
    ...extra,
  },
});

describe('findSuspectedDuplicates', () => {
  it('uses a 10 minute window', () => {
    expect(DUPLICATE_WINDOW_MINUTES).toBe(10);
  });

  it('flags a retry within the window and points at the original', () => {
    expect(
      findSuspectedDuplicates([a('first', '2026-01-14T18:00:00Z'), a('retry', '2026-01-14T18:09:59Z')]),
    ).toEqual([{ id: 'retry', duplicateOf: 'first' }]);
  });

  it('does not flag repeats outside the window (e.g. twice-daily medication)', () => {
    expect(
      findSuspectedDuplicates([a('am', '2026-01-14T08:00:00Z'), a('pm', '2026-01-14T20:00:00Z')]),
    ).toEqual([]);
  });

  it('needs the same guest, type and equal data (key order does not matter)', () => {
    expect(
      findSuspectedDuplicates([
        a('1', '2026-01-14T18:00:00Z'),
        a('2', '2026-01-14T18:01:00Z', { guestId: 'g2' }),
        a('3', '2026-01-14T18:01:00Z', { type: 'chore' }),
        a('4', '2026-01-14T18:01:00Z', { data: { medicationName: 'y', dose: 1 } }),
        a('5', '2026-01-14T18:02:00Z', { data: { dose: 1, medicationName: 'x' } }),
      ]),
    ).toEqual([{ id: '5', duplicateOf: '1' }]);
  });

  it('ignores inactive activities and ones without a timestamp', () => {
    expect(
      findSuspectedDuplicates([
        a('deleted', '2026-01-14T18:00:00Z', { status: 'deleted' }),
        a('x', '2026-01-14T18:00:30Z'),
        a('y', '2026-01-14T18:01:00Z'),
        a('none', '2026-01-14T18:01:10Z', { timestamp: undefined }),
      ]),
    ).toEqual([{ id: 'y', duplicateOf: 'x' }]);
  });

  it('does not flag a week of identical daily activities whose loggedAt an admin verify rewrote', () => {
    // verifyActivity sets loggedAt = serverTimestamp(), so all seven now share
    // one loggedAt seconds apart; their timestamps are a day apart.
    const days = Array.from({ length: 7 }, (_, i) =>
      a(`day${i}`, `2026-01-${String(12 + i).padStart(2, '0')}T09:00:00Z`, {
        verified: true,
        loggedAt: at(`2026-01-19T10:00:0${i}Z`),
      }),
    );
    expect(findSuspectedDuplicates(days)).toEqual([]);
  });

  it('flags a backdated retry that reused the identical form timestamp', () => {
    expect(
      findSuspectedDuplicates([
        a('first', '2026-01-10T09:00:00Z', { loggedAt: at('2026-01-14T18:00:00Z') }),
        a('retry', '2026-01-10T09:00:00Z', { loggedAt: at('2026-01-14T18:00:40Z') }),
      ]),
    ).toEqual([{ id: 'retry', duplicateOf: 'first' }]);
  });

  it('chains a burst of retries to the previous one', () => {
    expect(
      findSuspectedDuplicates([
        a('1', '2026-01-14T18:00:00Z'),
        a('2', '2026-01-14T18:00:20Z'),
        a('3', '2026-01-14T18:00:40Z'),
      ]),
    ).toEqual([
      { id: '2', duplicateOf: '1' },
      { id: '3', duplicateOf: '2' },
    ]);
  });
});
