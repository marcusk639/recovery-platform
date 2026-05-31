import {
  format,
  startOfWeek,
  endOfWeek,
  subWeeks,
  addWeeks,
  addDays,
  getDay,
  isAfter,
  isBefore,
  startOfDay,
  isWithinInterval,
  parseISO,
} from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

/** Parse a date string safely — date-only strings (YYYY-MM-DD) use noon to avoid timezone shift */
function safeParseDate(date: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Date(date + 'T12:00:00');
  }
  return new Date(date);
}
import { WeekDay } from '../screens/StatUpdates/MeetingSearch';
import { daysOfWeek } from '../components/weekdays';
import { color } from '../styles/theme';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

// export const STAT_LABEL_MAP = {
//   hoursWorked: 'Work',
//   choreCompleted: 'Chore',
//   meeting: 'Meetings',
//   medications: 'Medications',
//   metPrimarySupporter: 'Sponsor'
// };

// export const STAT_MAP = {
//   hoursWorked: 'briefcase',
//   choreCompleted: 'dolly',
//   meeting: 'user-friends',
//   medications: '',
//   metPrimarySupporter: 'handshake'
// };

interface StatMap {
  [key: string]: {
    icon: string;
    label: string;
    color: string;
    activityLabel: string;
  };
}

export const STAT_MAP: StatMap = {
  // camelCase keys (legacy)
  hoursWorked: {
    icon: 'briefcase',
    label: 'Work',
    color: color.blue_green,
    activityLabel: 'Work completed',
  },
  chore: {
    icon: 'dolly',
    label: 'Chore',
    color: color.dark_purple,
    activityLabel: 'Chore changed',
  },
  choreCompleted: {
    icon: 'dolly',
    label: 'Chore',
    color: color.dark_purple,
    activityLabel: 'Chore completed',
  },
  meeting: {
    icon: 'user-friends',
    label: 'Meetings',
    color: color.green_blue,
    activityLabel: 'Meeting attended',
  },
  medications: {
    icon: 'briefcase',
    label: 'Medications',
    color: color.cobalt,
    activityLabel: '',
  },
  metPrimarySupporter: {
    icon: 'handshake',
    label: 'Sponsor',
    color: color.pink,
    activityLabel: 'Met sponsor',
  },
  // snake_case keys (used by Activity entity)
  hours_worked: {
    icon: 'briefcase',
    label: 'Work',
    color: color.blue_green,
    activityLabel: 'Work completed',
  },
  chore_completed: {
    icon: 'dolly',
    label: 'Chore',
    color: color.dark_purple,
    activityLabel: 'Chore completed',
  },
  chore_changed: {
    icon: 'dolly',
    label: 'Chore',
    color: color.dark_purple,
    activityLabel: 'Chore changed',
  },
  meeting_attended: {
    icon: 'user-friends',
    label: 'Meetings',
    color: color.green_blue,
    activityLabel: 'Meeting attended',
  },
  medication_taken: {
    icon: 'briefcase',
    label: 'Medications',
    color: color.cobalt,
    activityLabel: 'Medication taken',
  },
  supporter_met: {
    icon: 'handshake',
    label: 'Sponsor',
    color: color.pink,
    activityLabel: 'Met sponsor',
  },
};

export function militaryHours(hour: number): {
  morning: string;
  evening: string;
} {
  if (hour === 12) {
    return {
      morning: '00',
      evening: '12',
    };
  } else {
    return {
      morning: '0' + hour,
      evening: Math.abs(hour - 24).toString(),
    };
  }
}

export function camelCaseToDisplayForm(field: string) {
  return (
    field
      // insert a space before all caps
      .replace(/([A-Z])/g, ' $1')
      // uppercase the first character
      .replace(/^./, str => str.toUpperCase())
  );
}

// gets the start date of the current week
export function getStartOfWeek(date?: string) {
  const d = date ? safeParseDate(date) : new Date();
  return format(startOfWeek(d), 'yyyy-MM-dd');
}

// gets the end date of the current week
export function getEndOfWeek(date?: string) {
  const d = date ? safeParseDate(date) : new Date();
  return format(endOfWeek(d), 'yyyy-MM-dd');
}

// gets today's date
export function getTodaysDate() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function getPreviousWeek(date: string) {
  return format(subWeeks(safeParseDate(date), 1), 'yyyy-MM-dd');
}

export function getNextWeek(date: string) {
  return format(addWeeks(safeParseDate(date), 1), 'yyyy-MM-dd');
}

// gets the number representing the day of the week
// for example, if the given date is tuesday, this function returns 2
// where Sunday is 0, Monday is 1, ..., Saturday is 6
export function getDayOfWeek(date: string, asString: boolean = false) {
  const day = getDay(safeParseDate(date));
  if (asString) {
    return daysOfWeek[day] as WeekDay;
  } else {
    return day;
  }
}

// returns the date for the nth day of the current week
// where 0 <= n <= 6
export function getWeekdayDate(day: number, date?: string) {
  const base = date ? safeParseDate(date) : new Date();
  return format(addDays(startOfWeek(base), day), 'yyyy-MM-dd');
}

/**
 * Returns true if dateToCheck is after dateToCheckAgainst
 * @param dateToCheck
 * @param dateToCheckAgainst
 */
export function dayIsAfter(
  dateToCheck: string | Date | number,
  dateToCheckAgainst: string | Date | number,
) {
  const a =
    typeof dateToCheck === 'string'
      ? safeParseDate(dateToCheck)
      : new Date(dateToCheck);
  const b =
    typeof dateToCheckAgainst === 'string'
      ? safeParseDate(dateToCheckAgainst)
      : new Date(dateToCheckAgainst);
  return isAfter(startOfDay(a), startOfDay(b));
}

/**
 * Returns true if dateToCheck is before dateToCheckAgainst
 * @param dateToCheck
 * @param dateToCheckAgainst
 */
export function dayIsBefore(dateToCheck: string, dateToCheckAgainst: string) {
  return isBefore(
    startOfDay(safeParseDate(dateToCheck)),
    startOfDay(safeParseDate(dateToCheckAgainst)),
  );
}

export function formatName(firstName?: string, lastName?: string): string {
  if (!firstName) {
    return '';
  }
  if (lastName) {
    return firstName + ' ' + lastName;
  }
  return firstName;
}

// gets the date range of the current week in the format: MM/DD - MM/DD
export function getWeekdayRange(): string {
  const startDate = getWeekdayDate(0).split('-').slice(1).join('/');
  const endDate = getWeekdayDate(6).split('-').slice(1).join('/');
  return startDate + ' - ' + endDate;
}

/**
 * Returns the date in "Day, Month Day, Year"
 * @param date
 */
export function getDate(date: string) {
  if (getTodaysDate() === date) {
    return 'Today';
  }
  return format(safeParseDate(date), 'EEEE, MMMM do yyyy');
}

export function getDateAndTime(date: any, minutes: boolean = true) {
  const d = typeof date === 'string' ? safeParseDate(date) : new Date(date);
  if (isNaN(d.getTime())) return '';
  return formatInTimeZone(
    d,
    tz,
    'EEEE, MMMM do yyyy' + (minutes ? ' hh:mm a' : ''),
  );
}

export function getPickerItems(
  object: any,
  translatorFn?: (rbKey: string) => string,
  keyAsLabel?: boolean,
  labelAttributes?: string[],
  valueAttribute?: string,
) {
  return Object.keys(object).map(key => {
    let label = keyAsLabel ? key : `${object[key]}`;
    if (labelAttributes && labelAttributes.length) {
      label = '';
      labelAttributes.forEach((attribute, index) => {
        label += object[key][attribute];
        if (index + 1 !== labelAttributes.length) {
          label += ' ';
        }
      });
    }
    return {
      key,
      label: translatorFn ? `${translatorFn(object[key])}` : label,
      value: valueAttribute ? object[key][valueAttribute] : object[key],
    };
  });
}

export function getFormattedTime(time: any) {
  return format(new Date(time), 'hh:mm a');
}

export function momentToDate(date: string) {
  return safeParseDate(date);
}

export function militaryTimeToDate(time: string) {
  const [hour, minute] = time.split(':');
  const d = new Date();
  d.setHours(parseInt(hour), parseInt(minute), 0, 0);
  return d;
}

export function getMilitaryTime(hour: number, minute: number) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return format(d, 'HH:mm');
}

export function timeIsBetween(timeToCheck: Date, begin: Date, end: Date) {
  return isWithinInterval(timeToCheck, { start: begin, end });
}

export function daysLeft(date: string) {
  return 7 - (getDayOfWeek(date) as number);
}

export function militaryTimeToFormatted(time: string) {
  return getFormattedTime(militaryTimeToDate(time));
}

export function nDaysFromNow(n: number): Date {
  return addDays(new Date(), n);
}

export function toDate(date: number | string | Date): Date {
  return new Date(date);
}

export function dateAndTime(date: Date) {
  return format(date, 'MM/dd/yyyy h:mm:ss a');
}

export function getCurrentTime() {
  return new Date().toISOString();
}

export function militaryTimeToStandard(time: string) {
  return getFormattedTime(militaryTimeToDate(time));
}

export function ordinalInWord(cardinal: number): string | undefined {
  var ordinals = [
    'zeroth',
    'first',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eigth',
    'ninth',
    'tenth',
    'eleventh',
    'twelfth',
    'thirteenth',
    'fourteenth',
    'fifteenth',
    'sixteenth',
    'seventeenth',
    'eighteenth',
    'nineteenth',
    'twentieth',
  ];
  var tens = {
    20: 'twenty',
    30: 'thirty',
    40: 'forty' /* and so on */,
  };
  var ordinalTens = {
    30: 'thirtieth',
    40: 'fortieth',
    50: 'fiftieth',
  };

  if (cardinal <= 20) {
    return ordinals[cardinal];
  }

  if (cardinal % 10 === 0) {
    return (ordinalTens as Record<number, string>)[cardinal];
  }

  return (
    (tens as Record<number, string>)[cardinal - (cardinal % 10)] +
    ordinals[cardinal % 10]
  );
}

export function numberToEnglish(n: number): string {
  var string = n.toString(),
    units,
    tens,
    scales,
    start,
    end,
    chunks,
    chunksLen,
    chunk,
    ints,
    i,
    word,
    words,
    and = 'and';

  /* Remove spaces and commas */
  string = string.replace(/[, ]/g, '');

  /* Is number zero? */
  if (parseInt(string) === 0) {
    return 'zero';
  }

  /* Array of units as words */
  units = [
    '',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
  ];

  /* Array of tens as words */
  tens = [
    '',
    '',
    'twenty',
    'thirty',
    'forty',
    'fifty',
    'sixty',
    'seventy',
    'eighty',
    'ninety',
  ];

  /* Array of scales as words */
  scales = [
    '',
    'thousand',
    'million',
    'billion',
    'trillion',
    'quadrillion',
    'quintillion',
    'sextillion',
    'septillion',
    'octillion',
    'nonillion',
    'decillion',
    'undecillion',
    'duodecillion',
    'tredecillion',
    'quatttuor-decillion',
    'quindecillion',
    'sexdecillion',
    'septen-decillion',
    'octodecillion',
    'novemdecillion',
    'vigintillion',
    'centillion',
  ];

  /* Split user arguemnt into 3 digit chunks from right to left */
  start = string.length;
  chunks = [];
  while (start > 0) {
    end = start;
    chunks.push(string.slice((start = Math.max(0, start - 3)), end));
  }

  /* Check if function has enough scale words to be able to stringify the user argument */
  chunksLen = chunks.length;
  if (chunksLen > scales.length) {
    return '';
  }

  /* Stringify each integer in each chunk */
  words = [];
  for (i = 0; i < chunksLen; i++) {
    chunk = parseInt(chunks[i]);

    if (chunk) {
      /* Split chunk into array of individual integers */
      ints = chunks[i].split('').reverse().map(parseFloat);

      /* If tens integer is 1, i.e. 10, then add 10 to units integer */
      if (ints[1] === 1) {
        ints[0] += 10;
      }

      /* Add scale word if chunk is not zero and array item exists */
      if ((word = scales[i])) {
        words.push(word);
      }

      /* Add unit word if array item exists */
      if ((word = units[ints[0]])) {
        words.push(word);
      }

      /* Add tens word if array item exists */
      if ((word = tens[ints[1]])) {
        words.push(word);
      }

      /* Add 'and' string after units or tens integer if: */
      if (ints[0] || ints[1]) {
        /* Chunk has a hundreds integer or chunk is the first of multiple chunks */
        if (ints[2] || (!i && chunksLen)) {
          words.push(and);
        }
      }

      /* Add hundreds word if array item exists */
      if ((word = units[ints[2]])) {
        words.push(word + ' hundred');
      }
    }
  }

  return words.reverse().join(' ');
}

export function romanize(num: number): string | typeof NaN {
  if (isNaN(num)) {
    return NaN;
  }
  var digits = String(+num).split(''),
    key = [
      '',
      'C',
      'CC',
      'CCC',
      'CD',
      'D',
      'DC',
      'DCC',
      'DCCC',
      'CM',
      '',
      'X',
      'XX',
      'XXX',
      'XL',
      'L',
      'LX',
      'LXX',
      'LXXX',
      'XC',
      '',
      'I',
      'II',
      'III',
      'IV',
      'V',
      'VI',
      'VII',
      'VIII',
      'IX',
    ],
    roman = '',
    i = 3;
  while (i--) {
    const poppedDigit = digits.pop();
    roman = (key[+(poppedDigit || '0') + i * 10] || '') + roman;
  }
  return Array(+digits.join('') + 1).join('M') + roman;
}

export const wait = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));
