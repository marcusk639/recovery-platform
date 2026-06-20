import { createHash } from 'crypto';
import { geohashForLocation } from 'geofire-common';

/**
 * FROZEN identity scheme for the shared meeting directory.
 *
 * There must be EXACTLY ONE hash recipe and ONE geohash precision repo-wide on
 * the directory path. homegroups drifted across precision 5/8/9/10 and across
 * day/time representations, producing duplicate + orphan docs. Do not add a
 * second hashing or geohash helper.
 *
 * Recipe ported from homegroups `scripts/cleanMeetings.ts` (generateMeetingHash):
 *   sha1(name | day | time | link | formattedAddress).slice(0, 24)
 * — but hashing the NORMALIZED day/time so equivalent representations
 * ("Tuesday" ≡ 2, "7:00 AM" ≡ "07:00") collapse to one id.
 */

/**
 * Frozen geohash precision. geofire-common's default is 10; homegroups'
 * read path (findMeetingsByLocation.ts) also uses 10. The `GEOHASH_PRECISION: 5`
 * in homegroups CONFIG was coarse-cell drift and is deliberately NOT used here.
 */
export const GEOHASH_PRECISION = 10;

// 0 = Sunday .. 6 = Saturday (JS getDay convention; matches homegroups daysOfWeek).
const DAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/**
 * Canonicalize a day-of-week to an integer 0–6 (0 = Sunday).
 * Accepts an integer, a numeric string, a full weekday name, or a 3-letter
 * abbreviation (case-insensitive). Throws on anything else so bad source data
 * surfaces rather than silently producing a divergent id.
 */
export function normalizeDay(input: number | string): number {
  if (typeof input === 'number') {
    if (Number.isInteger(input) && input >= 0 && input <= 6) return input;
    throw new RangeError(`normalizeDay: out-of-range day index: ${input}`);
  }

  const raw = input.trim().toLowerCase();
  if (/^[0-6]$/.test(raw)) return Number(raw);

  const full = DAYS.indexOf(raw as (typeof DAYS)[number]);
  if (full !== -1) return full;

  const abbrev = DAYS.findIndex((d) => d.slice(0, 3) === raw);
  if (abbrev !== -1) return abbrev;

  throw new RangeError(`normalizeDay: unrecognized day: ${JSON.stringify(input)}`);
}

/**
 * Canonicalize a local start time to "HH:mm" (24-hour). Accepts "HH:mm",
 * "HH:mm:ss", single-digit hours, and 12-hour "h:mm AM/PM". Throws on invalid.
 */
export function normalizeTime(input: string): string {
  const m = input.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!m) {
    throw new RangeError(`normalizeTime: unrecognized time: ${JSON.stringify(input)}`);
  }

  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const meridiem = m[3]?.toLowerCase();

  if (minute > 59) {
    throw new RangeError(`normalizeTime: minute out of range: ${JSON.stringify(input)}`);
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      throw new RangeError(`normalizeTime: 12-hour out of range: ${JSON.stringify(input)}`);
    }
    if (meridiem === 'am') hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) {
    throw new RangeError(`normalizeTime: 24-hour out of range: ${JSON.stringify(input)}`);
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** geofire-common geohash at the frozen precision. */
export function directoryGeohash(lat: number, lng: number): string {
  return geohashForLocation([lat, lng], GEOHASH_PRECISION);
}

export interface DirectoryMeetingIdInput {
  name: string;
  day: number | string;
  time: string;
  link?: string;
  formattedAddress?: string;
}

/**
 * Deterministic 24-char directory id. Pure function of the meeting's identifying
 * fields, hashed AFTER normalization so format variants collapse to one id.
 * `day` is deliberately part of the key (the same room hosts distinct meetings
 * on different days).
 */
export function directoryMeetingId(m: DirectoryMeetingIdInput): string {
  const parts = [
    m.name.trim(),
    String(normalizeDay(m.day)),
    normalizeTime(m.time),
    (m.link ?? '').trim(),
    (m.formattedAddress ?? '').trim(),
  ].join('|');

  return createHash('sha1').update(parts).digest('hex').slice(0, 24);
}
