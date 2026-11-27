/**
 * What turning rent charging on would charge one resident (rent spec §5: the manager
 * sees a preview before confirming). Pure: it runs the same anchor and charge rule
 * as chargeResident, on the settings the manager is about to save, and writes nothing.
 */
import { localDateString } from '../activities/weekSummaryMath';
import { Cents, addCents } from '../util/money';
import { anchorFor } from './anchor';
import { planCharges } from './chargeRule';
import { residentRate } from './rate';
import { RentAccount, RentSettings } from './types';

type Data = Record<string, unknown>;

export interface PreviewRow {
  guestId: string;
  /** What the house's staff see; returned to the caller only, never logged. */
  label: string;
  /** Added to the balance the moment charging turns on (0 when the first charge is later). */
  nowCents: Cents;
  /** The first day the resident's first charge covers (house-local YYYY-MM-DD). */
  firstDay: string;
  /** That first charge, prorated over daysCovered of daysInPeriod. */
  amountCents: Cents;
  daysCovered: number;
  daysInPeriod: number;
  rateSource: 'house' | 'custom';
}

export interface PreviewInput {
  guestId: string;
  guest: Data;
  houseId: string;
  account: Partial<RentAccount> | null;
  /** The guest doc's server createTime. */
  createdMs: number;
  /** The settings being previewed, with the start they would have once saved. */
  settings: RentSettings & { startDate: string; startedAtMs: number };
  now: Date;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function labelOf(guest: Data): string {
  return [str(guest.firstName), str(guest.lastName)].filter(Boolean).join(' ') || 'Resident';
}

/** Null when the resident's custom rate is above the schedule's limit: the job skips them too. */
export function previewResident(i: PreviewInput): PreviewRow | null {
  const { settings, account, now } = i;
  const { chargeFrom } = anchorFor({
    account,
    guest: i.guest,
    houseId: i.houseId,
    createdMs: i.createdMs,
    startDate: settings.startDate,
    startedAtMs: settings.startedAtMs,
    timeZone: settings.timeZone,
    frequency: settings.frequency,
    now,
  });
  const rate = residentRate(i.guest, settings);
  if (!rate) return null;
  const chargedThrough =
    typeof account?.chargedThrough === 'string' ? account.chargedThrough : null;
  const base = {
    chargeFrom,
    chargedThrough,
    frequency: settings.frequency,
    rateCents: rate.rateCents,
  };
  // The next charge, however far off: chargeFrom is never before today here.
  const [first] = planCharges({ ...base, today: '9999-12-31', maxPeriods: 1 });
  const today = localDateString(now, settings.timeZone);
  const dueNow = planCharges({ ...base, today });
  return {
    guestId: i.guestId,
    label: labelOf(i.guest),
    nowCents: addCents(...dueNow.map((c) => c.amountCents)),
    firstDay: first.from,
    amountCents: first.amountCents,
    daysCovered: first.daysCovered,
    daysInPeriod: first.daysInPeriod,
    rateSource: rate.source,
  };
}
