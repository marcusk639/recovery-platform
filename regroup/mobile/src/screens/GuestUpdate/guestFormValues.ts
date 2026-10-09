import { Guest } from '../../entities/Guest';
import { asCents, centsToDollars, parseDollarsInput } from '../../util/money';

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
    const stored = (guest as unknown as Record<string, number | undefined>)[
      field
    ];
    values[field] = centsToDollars(asCents(stored ?? 0));
  }
  return values;
}

/**
 * Submitted dollar figures -> stored cents.
 *
 * Each field falls back to the guest's existing stored cents when the input is
 * blank or unusable, so a cleared field cannot silently wipe an outstanding
 * balance. An explicit "0" is still zero.
 */
export function formValuesToGuest(
  guest: Guest,
  values: GuestFormValues,
): Guest {
  const merged = { ...guest, ...values } as unknown as Record<string, unknown>;
  for (const field of CENTS_FIELDS) {
    const stored = (guest as unknown as Record<string, number | undefined>)[
      field
    ];
    merged[field] = parseDollarsInput(
      values[field] as string | number | undefined,
      asCents(stored ?? 0),
    );
  }
  return merged as unknown as Guest;
}
