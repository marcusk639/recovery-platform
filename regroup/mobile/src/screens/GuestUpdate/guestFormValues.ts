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
    values[field] = centsToDollars(asCents(storedCents(guest, field)));
  }
  return values;
}

function storedCents(guest: Guest, field: string): number {
  return (
    (guest as unknown as Record<string, number | undefined>)[field] ?? 0
  );
}

/**
 * The money fields whose submitted value differs from what is stored.
 *
 * Only these are sent, and only these are declared authoritative. A field the
 * operator never touched must not be submitted at all: `rentOwed` is decremented
 * server-side when a resident pays, so writing back an absolute figure captured
 * when the form opened would silently undo that payment. Omitting the field
 * leaves the stored value standing.
 */
export function changedMoneyFields(
  guest: Guest,
  values: GuestFormValues,
): ReadonlyArray<keyof Guest> {
  return CENTS_FIELDS.filter(field => {
    const stored = asCents(storedCents(guest, field));
    return parseDollarsInput(
      values[field] as string | number | undefined,
      stored,
    ) !== stored;
  }) as ReadonlyArray<keyof Guest>;
}

/**
 * Submitted dollar figures -> stored cents, for the changed fields only.
 *
 * A blank or unusable input resolves to the stored value and therefore counts as
 * unchanged, so it is omitted rather than written back — clearing the field
 * cannot wipe a balance. An explicit "0" differs from a non-zero balance and is
 * submitted as a real zero.
 */
export function formValuesToGuest(
  guest: Guest,
  values: GuestFormValues,
): Partial<Guest> {
  const merged = { ...guest, ...values } as unknown as Record<string, unknown>;
  const changed = changedMoneyFields(guest, values);
  for (const field of CENTS_FIELDS) {
    if (changed.includes(field as keyof Guest)) {
      merged[field] = parseDollarsInput(
        values[field] as string | number | undefined,
        asCents(storedCents(guest, field)),
      );
    } else {
      delete merged[field];
    }
  }
  return merged as Partial<Guest>;
}
