// src/__tests__/scripts/paymentMigrationCutoff.test.ts
//
// The #82 deploy cutoff in isolation: the mandatory --deployed-at flag and
// the timestamp that dates a document's last `amount` write. Pure functions —
// nothing here imports firebase-admin or scriptBootstrap.

import { lastAmountWriteAt, parseDeployedAt } from '../../scripts/paymentMigrationCutoff';

const BEFORE = '2026-10-15T00:00:00.000Z';

describe('parseDeployedAt', () => {
  const now = Date.parse('2026-10-20T00:00:00.000Z');

  it('accepts an ISO instant in the past', () => {
    expect(parseDeployedAt([`--deployed-at=${BEFORE}`], now)).toEqual({
      cutoff: Date.parse(BEFORE),
    });
  });

  it('refuses when the flag is absent', () => {
    expect(parseDeployedAt([], now)).toMatchObject({
      error: expect.stringContaining('--deployed-at'),
    });
    expect(parseDeployedAt(['--apply'], now)).toMatchObject({ error: expect.any(String) });
  });

  it('refuses a value that does not parse', () => {
    // Date.parse('monday') is NaN, and every comparison against NaN is false —
    // the guard would be nominally satisfied while converting everything.
    expect(parseDeployedAt(['--deployed-at=monday'], now)).toMatchObject({
      error: expect.stringContaining('not a parseable timestamp'),
    });
    expect(parseDeployedAt(['--deployed-at='], now)).toMatchObject({
      error: expect.stringContaining('not a parseable timestamp'),
    });
  });

  it('refuses a cutoff in the future', () => {
    expect(parseDeployedAt(['--deployed-at=2026-10-21T00:00:00.000Z'], now)).toMatchObject({
      error: expect.stringContaining('in the future'),
    });
  });

  it('accepts a cutoff exactly at now', () => {
    expect(parseDeployedAt([`--deployed-at=${new Date(now).toISOString()}`], now)).toEqual({
      cutoff: now,
    });
  });
});

describe('lastAmountWriteAt', () => {
  it('reads ISO strings, epoch numbers, Dates and Firestore Timestamps', () => {
    const ms = Date.parse(BEFORE);
    expect(lastAmountWriteAt({ updatedAt: BEFORE })).toBe(ms);
    expect(lastAmountWriteAt({ updatedAt: ms })).toBe(ms);
    expect(lastAmountWriteAt({ updatedAt: new Date(ms) })).toBe(ms);
    expect(lastAmountWriteAt({ updatedAt: { toMillis: () => ms } })).toBe(ms);
    expect(lastAmountWriteAt({ updatedAt: { toDate: () => new Date(ms) } })).toBe(ms);
  });

  it('prefers updatedAt and falls back to createdAt only when it is absent', () => {
    const newer = Date.parse('2026-10-17T00:00:00.000Z');
    expect(lastAmountWriteAt({ createdAt: BEFORE, updatedAt: newer })).toBe(newer);
    expect(lastAmountWriteAt({ createdAt: BEFORE })).toBe(Date.parse(BEFORE));
  });

  it('returns null for anything it cannot turn into an instant', () => {
    expect(lastAmountWriteAt({})).toBeNull();
    expect(lastAmountWriteAt({ updatedAt: null })).toBeNull();
    expect(lastAmountWriteAt({ updatedAt: 'monday' })).toBeNull();
    expect(lastAmountWriteAt({ updatedAt: Number.NaN })).toBeNull();
    expect(lastAmountWriteAt({ updatedAt: new Date('nope') })).toBeNull();
    expect(lastAmountWriteAt({ updatedAt: { toMillis: () => 'soon' } })).toBeNull();
    expect(lastAmountWriteAt({ updatedAt: { toDate: () => 'soon' } })).toBeNull();
    expect(lastAmountWriteAt({ updatedAt: {} })).toBeNull();
    expect(lastAmountWriteAt({ updatedAt: true })).toBeNull();
  });
});
