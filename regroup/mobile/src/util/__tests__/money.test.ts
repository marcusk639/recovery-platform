import {
  Cents,
  Dollars,
  asCents,
  asDollars,
  centsToDollars,
  addCents,
  dollarsToCents,
  formatCents,
  formatDollars,
  parseDollarsInput,
  subtractCents,
} from '../money';

describe('money units', () => {
  it('converts dollars to integer cents without floating-point drift', () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE 754; a bare multiply truncates to 1998
    expect(dollarsToCents(asDollars(19.99))).toBe(1999);
    expect(dollarsToCents(asDollars(0.07))).toBe(7);
    expect(dollarsToCents(asDollars(500))).toBe(50000);
  });

  it('round-trips a dollar amount through cents', () => {
    const original = asDollars(1234.56);
    expect(centsToDollars(dollarsToCents(original))).toBe(1234.56);
  });

  it('formats cents as a currency string, never dividing at the call site', () => {
    expect(formatCents(asCents(50000))).toBe('$500.00');
    expect(formatCents(asCents(7))).toBe('$0.07');
    expect(formatCents(asCents(0))).toBe('$0.00');
  });

  describe('parseDollarsInput — the admin form boundary', () => {
    it('parses a typed dollar string into cents', () => {
      expect(parseDollarsInput('500', asCents(0))).toBe(50000);
      expect(parseDollarsInput('19.99', asCents(0))).toBe(1999);
      expect(parseDollarsInput('$1,234.56', asCents(0))).toBe(123456);
    });

    it('treats an explicit zero as zero', () => {
      expect(parseDollarsInput('0', asCents(50000))).toBe(0);
    });

    it('keeps the previous balance when the field is blank or unparseable', () => {
      // Silently zeroing a resident's outstanding rent would be worse than
      // rejecting the edit, so an unusable input preserves what was stored.
      expect(parseDollarsInput('', asCents(50000))).toBe(50000);
      expect(parseDollarsInput('   ', asCents(50000))).toBe(50000);
      expect(parseDollarsInput('abc', asCents(50000))).toBe(50000);
      expect(parseDollarsInput(undefined, asCents(50000))).toBe(50000);
    });

    it('rejects ambiguous or non-decimal input instead of mis-scaling it', () => {
      const stored = asCents(50000);
      // Stripping separators unconditionally turned these into 100x-1000x errors:
      // '12,34' parsed as 1234 dollars, '1.234,56' as 1.23, '1e3' as 1000.
      expect(parseDollarsInput('12,34', stored)).toBe(stored);
      expect(parseDollarsInput('1.234,56', stored)).toBe(stored);
      expect(parseDollarsInput('1 2 3', stored)).toBe(stored);
      expect(parseDollarsInput('1e3', stored)).toBe(stored);
      expect(parseDollarsInput('0x10', stored)).toBe(stored);
      expect(parseDollarsInput('1.2.3', stored)).toBe(stored);
      expect(parseDollarsInput('500.123', stored)).toBe(stored);
    });

    it('accepts correctly grouped thousands and a plain decimal', () => {
      expect(parseDollarsInput('1,234.56', asCents(0))).toBe(123456);
      expect(parseDollarsInput('$1,234,567.89', asCents(0))).toBe(123456789);
      expect(parseDollarsInput('750', asCents(0))).toBe(75000);
      expect(parseDollarsInput('750.5', asCents(0))).toBe(75050);
    });

    it('rejects a negative amount rather than creating a credit by typo', () => {
      expect(parseDollarsInput('-50', asCents(50000))).toBe(50000);
    });
  });

  /**
   * Pins the exact enforcement boundary of the brands. Verified by `tsc`, not by
   * jest: an `@ts-expect-error` that turns out to be unnecessary is itself a
   * compile error (TS2578), so this block fails loudly if a future TypeScript
   * version or type change weakens the protection.
   */
  describe('unit enforcement boundary (checked by tsc)', () => {
    it('refuses to store dollars in a cents field', () => {
      const rent: Dollars = asDollars(500);
      // @ts-expect-error — Dollars is not assignable to Cents
      const owed: Cents = rent;
      expect(owed).toBe(500);
    });

    it('refuses to pass dollars to a function expecting cents', () => {
      // @ts-expect-error — formatCents takes Cents
      expect(formatCents(asDollars(500))).toBe('$5.00');
    });

    it('refuses a bare number, forcing an explicit asCents at trust boundaries', () => {
      // @ts-expect-error — a raw number carries no unit
      const owed: Cents = 50000;
      expect(owed).toBe(50000);
    });

    it('refuses to store an arithmetic result without re-asserting the unit', () => {
      const owed = asCents(50000);
      const rent = asDollars(500);
      // This is the rent-accrual bug — adding dollars to a cents balance. The
      // sum is plain `number`, so assigning it back to a Cents field fails.
      // @ts-expect-error — number is not assignable to Cents
      const next: Cents = owed + dollarsToCents(rent) * 0 + rent;
      expect(typeof next).toBe('number');
    });

    it('KNOWN GAP: mixing units inside a plain-number expression is not caught', () => {
      const owed: Cents = asCents(50000);
      const rent: Dollars = asDollars(500);
      // TypeScript's `+` accepts any number-assignable operands and yields
      // `number`, so this compiles. The brands stop the *result* from being
      // stored as Cents, which is where the damage would land — but an
      // intermediate typed as `number` escapes them. Keep money arithmetic in
      // functions with branded parameters rather than inline expressions.
      const leaked: number = owed + rent;
      expect(leaked).toBe(50500);
    });
  });

  describe('arithmetic that keeps its unit', () => {
    it('adds cents without losing the brand', () => {
      const total: Cents = addCents(asCents(50000), asCents(2500));
      expect(total).toBe(52500);
      expect(addCents()).toBe(0);
    });

    it('accrues rent correctly: dollars converted, then added as cents', () => {
      // The rent-accrual job that does not exist yet. Written the wrong way
      // (owed + monthlyRent) this does not compile, which is the point.
      const owed = asCents(50000);
      const monthlyRent = asDollars(750);
      expect(addCents(owed, dollarsToCents(monthlyRent))).toBe(125000);
    });

    it('subtracts a payment and clamps at zero rather than going negative', () => {
      expect(subtractCents(asCents(50000), asCents(20000))).toBe(30000);
      // Clamping hides a credit on a rent ledger — see the note on subtractCents.
      expect(subtractCents(asCents(5000), asCents(9999))).toBe(0);
    });

    it('formats an already-dollar amount', () => {
      expect(formatDollars(asDollars(500))).toBe('$500.00');
    });
  });
});
