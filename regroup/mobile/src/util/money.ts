/**
 * Money units.
 *
 * Regroup stores two rent-related amounts in two different units:
 *   - `guest.rentOwed` / `guest.choreFees` are integer CENTS (the ledger the
 *     Stripe charge path reads; see functions/src/scheduled/scheduledRentCollection.ts).
 *   - `house.monthlyRent` / `house.weeklyRent` are DOLLARS (what an operator
 *     types into the house setup form).
 *
 * Mixing them is a 100x money error, and it has already come close to firing:
 * RentPaymentScreen's header records that fixing the "doesn't actually charge"
 * bug without also fixing a formatter would have charged every resident 100x
 * their balance. Until now the only thing preventing that was a comment.
 *
 * These brands make the mistake a compile error instead. They carry no runtime
 * cost — a branded value is still just a number at runtime — so the conversion
 * helpers are the only place a /100 or *100 should appear.
 *
 * There is no rent-accrual job in regroup today; `rentOwed` is raised by a
 * human. When that job is written it will need `dollarsToCents(house.monthlyRent)`,
 * and the type system will now insist on it.
 */

declare const centsBrand: unique symbol;
declare const dollarsBrand: unique symbol;

/** An integer number of cents. The unit every stored balance and Stripe amount uses. */
export type Cents = number & { readonly [centsBrand]: true };

/** A decimal number of dollars. The unit humans type and read. */
export type Dollars = number & { readonly [dollarsBrand]: true };

/**
 * Assert that a raw number is already in cents. Use at a trust boundary —
 * reading a stored field, or a Stripe amount — not to paper over a mismatch.
 */
export function asCents(value: number): Cents {
  return value as Cents;
}

/** Assert that a raw number is already in dollars. */
export function asDollars(value: number): Dollars {
  return value as Dollars;
}

/**
 * Rounds, because binary floating point cannot represent most cent values:
 * `19.99 * 100` is 1998.9999999999998, which truncates to 1998 — a silent
 * one-cent loss per conversion.
 */
export function dollarsToCents(dollars: Dollars): Cents {
  return Math.round(dollars * 100) as Cents;
}

/**
 * Adds cent amounts and keeps the unit.
 *
 * `a + b` on two Cents yields plain `number`, so storing the result needs a
 * re-assertion. Without a helper the obvious workaround is an `as Cents` cast,
 * and a codebase that casts routinely has no brand at all. These keep the safe
 * path the short one.
 */
export function addCents(...amounts: Cents[]): Cents {
  return amounts.reduce<number>((sum, n) => sum + n, 0) as Cents;
}

/** Subtracts cents from cents, clamping at zero so a balance cannot go negative. */
export function subtractCents(from: Cents, amount: Cents): Cents {
  return Math.max(0, from - amount) as Cents;
}

export function centsToDollars(cents: Cents): Dollars {
  return (cents / 100) as Dollars;
}

export function formatCents(cents: Cents): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDollars(dollars: Dollars): string {
  return `$${dollars.toFixed(2)}`;
}

/**
 * Converts a dollar amount typed into a form field to cents.
 *
 * `fallback` is returned when the input is blank or unusable. That is
 * deliberate: this function backs an admin field that edits a resident's
 * outstanding rent, and silently resolving a cleared field to zero would wipe a
 * real debt with no warning. An explicit "0" still means zero. A negative
 * amount is rejected rather than quietly turned into a credit.
 */
export function parseDollarsInput(
  raw: string | number | undefined | null,
  fallback: Cents,
): Cents {
  if (raw === undefined || raw === null) {
    return fallback;
  }
  // Outer whitespace and a leading currency symbol are noise; INTERNAL
  // whitespace is ambiguous ('1 2 3' is not 123) and is refused below.
  const trimmed = String(raw).trim().replace(/^\$/, '').trim();
  if (trimmed.length === 0) {
    return fallback;
  }
  if (/\s/.test(trimmed)) {
    return fallback;
  }

  // Commas are only accepted as thousands grouping. Stripping every separator
  // unconditionally silently mis-scaled real input: '12,34' became 1234 dollars
  // (100x), '1.234,56' became 1.23, and Number() also accepts '1e3' and '0x10'.
  // Anything that is not a plain decimal amount is refused rather than guessed
  // at, because a wrong magnitude on a rent balance is worse than a rejected edit.
  const degrouped = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(trimmed)
    ? trimmed.replace(/,/g, '')
    : trimmed;

  if (!/^\d+(\.\d{1,2})?$/.test(degrouped)) {
    return fallback;
  }

  const parsed = Number(degrouped);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return dollarsToCents(parsed as Dollars);
}
