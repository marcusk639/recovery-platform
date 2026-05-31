import moment from "moment";

export const daysOfWeek = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
export function camelCaseToDisplayForm(field: string) {
  return (
    field
      // insert a space before all caps
      .replace(/([A-Z])/g, " $1")
      // uppercase the first character
      .replace(/^./, (str) => str.toUpperCase())
  );
}

export function getYesterdaysDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return moment(date).format("YYYY-MM-DD");
}

// gets the start date of the current week
export function getStartOfWeek(date?: string) {
  return moment(date).startOf("week").format("YYYY-MM-DD");
}

// gets the end date of the current week
export function getEndOfWeek(date?: string) {
  return moment(date).endOf("week").format("YYYY-MM-DD");
}

// gets today's date
export function getTodaysDate() {
  return moment().format("YYYY-MM-DD");
}

export function getCurrentTime() {
  return moment().format();
}

// gets the number representing the day of the week
// for example, if the given date is tuesday, this function returns 2
// where Sunday is 0, Monday is 1, ..., Saturday is 6
export function getDayOfWeek(date: string) {
  return moment(date).day();
}

// returns the date for the nth day of the current week
// where 0 <= n <= 6
export function getWeekdayDate(day: number, date?: string) {
  return moment(date).day(day).format("YYYY-MM-DD");
}

export function getMilitaryTime(hour: number, minute: number) {
  return moment().hour(hour).minute(minute).format("HH:mm").toString();
}

/**
 * Returns true if dateToCheck is after dateToCheckAgainst
 * @param dateToCheck
 * @param dateToCheckAgainst
 */
export function dateIsAfter(dateToCheck: string, dateToCheckAgainst: string) {
  return moment(dateToCheck).isAfter(moment(dateToCheckAgainst));
}

/**
 * Returns true if dateToCheck is after dateToCheckAgainst
 * @param dateToCheck
 * @param dateToCheckAgainst
 */
export function dayIsAfter(dateToCheck: string, dateToCheckAgainst: string) {
  return moment(dateToCheck).isAfter(moment(dateToCheckAgainst), "day");
}

/**
 * Returns true if dateToCheck is before dateToCheckAgainst
 * @param dateToCheck
 * @param dateToCheckAgainst
 */
export function dayIsBefore(dateToCheck: string, dateToCheckAgainst: string) {
  return moment(dateToCheck).isBefore(moment(dateToCheckAgainst), "day");
}

// gets the date range of the current week in the format: MM/DD - MM/DD
export function getWeekdayRange(): string {
  const startDate = getWeekdayDate(0).split("-").slice(1).join("/");
  const endDate = getWeekdayDate(6).split("-").slice(1).join("/");
  return startDate + " - " + endDate;
}

export function getPickerItems(
  object: any,
  translatorFn?: (rbKey: string) => string,
  keyAsLabel?: boolean
) {
  return Object.keys(object).map((key) => ({
    key,
    label: translatorFn
      ? `${translatorFn(object[key])}`
      : keyAsLabel
      ? key
      : `${object[key]}`,
    value: object[key],
  }));
}

export const dateIsInWeek = (
  date: string,
  weekBeginDate: string,
  weekEndDate: string
) => {
  return !dayIsAfter(date, weekEndDate) && !dayIsBefore(date, weekBeginDate);
};

export const dayDiff = (date1: string, date2: string) => {
  return Math.abs(moment(date1).diff(moment(date2), "days"));
};
