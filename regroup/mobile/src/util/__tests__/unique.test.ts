// src/util/__tests__/unique.test.ts
//
// Unit tests for unique.ts.
// Exports a single pure function: uniquify(array) → array with duplicates removed.
// No external dependencies — no mocks required.

import { uniquify } from '../unique';

describe('uniquify', () => {
  // ── Happy path ────────────────────────────────────────────────────────────

  it('removes duplicate primitive values from a number array', () => {
    expect(uniquify([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it('removes duplicate strings from a string array', () => {
    expect(uniquify(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });

  it('preserves the first occurrence order', () => {
    expect(uniquify([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });

  it('returns an array equal to the input when no duplicates exist', () => {
    expect(uniquify([10, 20, 30])).toEqual([10, 20, 30]);
  });

  it('returns an empty array when given an empty array', () => {
    expect(uniquify([])).toEqual([]);
  });

  // ── Single-element ────────────────────────────────────────────────────────

  it('returns a single-element array unchanged', () => {
    expect(uniquify([42])).toEqual([42]);
  });

  it('de-duplicates a single repeated value into one element', () => {
    expect(uniquify(['x', 'x', 'x'])).toEqual(['x']);
  });

  // ── Mixed types ───────────────────────────────────────────────────────────

  it('handles arrays with mixed primitive types without throwing', () => {
    const result = uniquify([1, 'one', 1, 'one', true, true]);
    expect(result).toEqual([1, 'one', true]);
  });

  it('treats the number 0 and the string "0" as distinct values', () => {
    const result = uniquify([0, '0', 0, '0']);
    expect(result).toContain(0);
    expect(result).toContain('0');
    expect(result.length).toBe(2);
  });

  // ── Reference equality for objects ───────────────────────────────────────

  it('does not deduplicate distinct object references even with identical content', () => {
    // Set uses reference equality for objects
    const a = { id: 1 };
    const b = { id: 1 };
    const result = uniquify([a, b]);
    expect(result.length).toBe(2);
  });

  it('deduplicates the same object reference', () => {
    const obj = { id: 1 };
    const result = uniquify([obj, obj, obj]);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(obj);
  });

  // ── Nullish values ────────────────────────────────────────────────────────

  it('handles null values and deduplicates them', () => {
    expect(uniquify([null, null, 1])).toEqual([null, 1]);
  });

  it('handles undefined values and deduplicates them', () => {
    expect(uniquify([undefined, undefined, 'x'])).toEqual([undefined, 'x']);
  });

  it('returns an Array instance', () => {
    expect(Array.isArray(uniquify([1, 2]))).toBe(true);
  });
});
