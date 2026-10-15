import { Guest } from '../../entities/Guest';
import {
  asCents,
  centsToDollars,
  parseDollarsField,
} from '../../util/money';

/**
 * Money boundary for the guest update form.
 *
 * `guest.rentOwed` and `guest.choreFees` are stored in integer cents, but this
 * form is the one place a human edits them. It previously fed the raw stored
 * value into a text input (`mapPropsToValues: ({ guest }) => guest`) with no
 * conversion and no unit in the label, while every other screen rendered the
 * same fields as dollars. An operator typing `500` meaning $500 set the balance
 * to $5.00 — a silent 100x under-charge.
 *
 * Conversion lives here, in pure functions, so it is testable without rendering
 * the screen and so the formik config stays declarative.
 */

/** Money fields on Guest, stored in cents and edited in dollars. */
const CENTS_FIELDS = ['rentOwed', 'choreFees'] as const;

export type GuestFormValues = Record<string, unknown>;

/** Stored cents -> the dollar figures shown in the form. */
export function guestToFormValues(guest: Guest): GuestFormValues {
  const values: GuestFormValues = { ...guest };
  for (const field of CENTS_FIELDS) {
    values[field] = centsToDollars(asCents(storedCents(guest, field)));
  }
  return values;
}

function storedCents(guest: Guest, field: string): number {
  return (
    (guest as unknown as Record<string, number | undefined>)[field] ?? 0
  );
}

export type GuestMoneyUpdate =
  | {
      ok: true;
      payload: Partial<Guest>;
      authoritativeFields: ReadonlyArray<keyof Guest>;
    }
  | { ok: false; malformedFields: ReadonlyArray<keyof Guest> };

/**
 * Validates and converts the form's money fields in a single pass.
 *
 * One traversal, one parse per field, three outcomes sorted as we go. This was
 * three functions parsing the same field four times between them, where only
 * one of the four could reject — so the rejection travelled as "we returned
 * early" and money was protected by statement order at one call site.
 * Returning a discriminated result removes the ordering hazard rather than
 * enforcing it, and keeps authoritativeFields in the same arm as the payload
 * it describes so they cannot desynchronise.
 *
 * A field is judged only on what the operator TYPED. The form seeds each input
 * with centsToDollars(stored), so judging the seeded value would let a legacy
 * non-integer balance reject input nobody entered and brick every field on
 * that guest.
 */
export function guestMoneyUpdate(
  guest: Guest,
  values: GuestFormValues,
): GuestMoneyUpdate {
  const seeded = guestToFormValues(guest);
  const payload = { ...guest, ...values } as unknown as Record<string, unknown>;
  const authoritativeFields: Array<keyof Guest> = [];
  const malformedFields: Array<keyof Guest> = [];

  for (const field of CENTS_FIELDS) {
    const raw = values[field] as string | number | undefined;
    const untouched = String(raw ?? '') === String(seeded[field] ?? '');
    const parsed = parseDollarsField(raw);

    if (!parsed.ok && parsed.reason === 'malformed' && !untouched) {
      malformedFields.push(field as keyof Guest);
      continue;
    }

    const stored = asCents(storedCents(guest, field));
    if (parsed.ok && parsed.cents !== stored) {
      payload[field] = parsed.cents;
      authoritativeFields.push(field as keyof Guest);
    } else {
      // Blank, unchanged, or a seeded value we cannot re-read: leave the
      // stored figure standing rather than writing an absolute value back
      // over a concurrent server-side decrement.
      delete payload[field];
    }
  }

  if (malformedFields.length > 0) {
    return { ok: false, malformedFields };
  }
  return { ok: true, payload: payload as Partial<Guest>, authoritativeFields };
}
