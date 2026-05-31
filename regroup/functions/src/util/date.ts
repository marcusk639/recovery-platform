import moment from 'moment';

export const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Converts a camelCase field name to a human-readable display form, e.g. "houseId" → "House Id". */
export function camelCaseToDisplayForm(field: string) {
  return (
    field
      // Insert a space before each uppercase letter.
      .replace(/([A-Z])/g, ' $1')
      // Uppercase the first character.
      .replace(/^./, str => str.toUpperCase())
  );
}

/** Returns yesterday's date in YYYY-MM-DD format. */
export function getYesterdaysDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return moment(date).format('YYYY-MM-DD');
}

/** Returns the start (Sunday) of the week containing the given date, in YYYY-MM-DD format. */
export function getStartOfWeek(date?: string) {
  return moment(date)
    .startOf('week')
    .format('YYYY-MM-DD');
}

/** Returns the end (Saturday) of the week containing the given date, in YYYY-MM-DD format. */
export function getEndOfWeek(date?: string) {
  return moment(date)
    .endOf('week')
    .format('YYYY-MM-DD');
}

/** Returns today's date in YYYY-MM-DD format. */
export function getTodaysDate() {
  return moment().format('YYYY-MM-DD');
}

/** Returns the current local time as an ISO 8601 string. */
export function getCurrentTime() {
  return moment().format();
}

/**
 * Returns the number representing the day of the week for the given date.
 * Sunday = 0, Monday = 1, ..., Saturday = 6.
 */
export function getDayOfWeek(date: string) {
  return moment(date).day();
}

/**
 * Returns the YYYY-MM-DD date for the nth day (0=Sunday, ..., 6=Saturday)
 * of the week containing the given date (or the current week if omitted).
 */
export function getWeekdayDate(day: number, date?: string) {
  return moment(date)
    .day(day)
    .format('YYYY-MM-DD');
}

/** Formats a 24-hour hour and minute pair as an HH:mm string (e.g. getMilitaryTime(9, 5) → "09:05"). */
export function getMilitaryTime(hour: number, minute: number) {
  return moment()
    .hour(hour)
    .minute(minute)
    .format('HH:mm');
}

/**
 * Returns true if dateToCheck is strictly after dateToCheckAgainst (any time granularity).
 */
export function dateIsAfter(dateToCheck: string, dateToCheckAgainst: string) {
  return moment(dateToCheck).isAfter(moment(dateToCheckAgainst));
}

/**
 * Returns true if dateToCheck is strictly after dateToCheckAgainst at day granularity.
 */
export function dayIsAfter(dateToCheck: string, dateToCheckAgainst: string) {
  return moment(dateToCheck).isAfter(moment(dateToCheckAgainst), 'day');
}

/**
 * Returns true if dateToCheck is strictly before dateToCheckAgainst at day granularity.
 */
export function dayIsBefore(dateToCheck: string, dateToCheckAgainst: string) {
  return moment(dateToCheck).isBefore(moment(dateToCheckAgainst), 'day');
}

/** Returns the current week's date range as a "MM/DD - MM/DD" string. */
export function getWeekdayRange(): string {
  const startDate = getWeekdayDate(0)
    .split('-')
    .slice(1)
    .join('/');
  const endDate = getWeekdayDate(6)
    .split('-')
    .slice(1)
    .join('/');
  return startDate + ' - ' + endDate;
}

/**
 * Converts an object into an array of picker items with key, label, and value fields.
 *
 * @param object - the source object whose keys become picker items
 * @param translatorFn - optional function to translate the value to a display label
 * @param keyAsLabel - when true and no translatorFn, use the key as the label instead of the value
 */
export function getPickerItems<T extends Record<string, string>>(
  object: T,
  translatorFn?: (rbKey: string) => string,
  keyAsLabel?: boolean
) {
  return Object.keys(object).map(key => ({
    key,
    label: translatorFn
      ? `${translatorFn(object[key])}`
      : keyAsLabel
        ? key
        : `${object[key]}`,
    value: object[key],
  }));
}

/** Returns true if the given date falls within [weekBeginDate, weekEndDate] inclusive. */
export const dateIsInWeek = (date: string, weekBeginDate: string, weekEndDate: string) => {
  return !dayIsAfter(date, weekEndDate) && !dayIsBefore(date, weekBeginDate);
};

/** Returns the absolute number of calendar days between two dates. */
export const dayDiff = (date1: string, date2: string) => {
  return Math.abs(moment(date1).diff(moment(date2), 'days'));
};
