const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Wording for a directory listing imported from an old snapshot. Read from the
 * string, not a Date, so the device time zone cannot shift it across a month.
 * Duplicated in regroup/mobile/src/util/dataAsOf.ts: products share no code.
 */
export function formatDataAsOf(dataAsOf?: string | null): string | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(dataAsOf ?? '');
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `Listing data from ${month} ${match[1]}` : null;
}
