// src/__tests__/util/week.test.ts
import { buildWeekId, getNextWeekStart, getCurrentWeekStart, sumStat } from '../../util/week';
import Week from '../../entities/Week';

describe('buildWeekId', () => {
  it('builds id as guestId_weekStart', () => {
    expect(buildWeekId('guest-123', '2024-01-15')).toBe('guest-123_2024-01-15');
  });
});

describe('getNextWeekStart', () => {
  it('returns the next Monday from a Monday', () => {
    expect(getNextWeekStart('2024-01-15')).toBe('2024-01-22');
  });
  it('returns the next Monday from a Wednesday', () => {
    expect(getNextWeekStart('2024-01-17')).toBe('2024-01-22');
  });
  it('returns the next Monday from a Sunday', () => {
    expect(getNextWeekStart('2024-01-21')).toBe('2024-01-22');
  });
});

describe('getCurrentWeekStart', () => {
  it('returns Monday for a Wednesday date', () => {
    const wednesday = new Date('2024-01-17T12:00:00Z');
    expect(getCurrentWeekStart(wednesday)).toBe('2024-01-15');
  });
  it('returns Monday for a Monday date', () => {
    const monday = new Date('2024-01-15T12:00:00Z');
    expect(getCurrentWeekStart(monday)).toBe('2024-01-15');
  });
  it('returns Monday for a Sunday date (previous Monday)', () => {
    const sunday = new Date('2024-01-21T12:00:00Z');
    expect(getCurrentWeekStart(sunday)).toBe('2024-01-15');
  });
});

describe('sumStat', () => {
  const makeWeek = (days: Record<string, any>): Week => ({ days } as Week);

  it('sums boolean stats (true = 1, false = 0)', () => {
    const week = makeWeek({
      '2024-01-15': { choreCompleted: true },
      '2024-01-16': { choreCompleted: false },
      '2024-01-17': { choreCompleted: true },
    });
    expect(sumStat(week, 'choreCompleted')).toBe(2);
  });

  it('sums array stats (counts items)', () => {
    const week = makeWeek({
      '2024-01-15': { meeting: ['AA Meeting'] },
      '2024-01-16': { meeting: ['NA Meeting', 'AA Meeting'] },
    });
    expect(sumStat(week, 'meeting')).toBe(3);
  });

  it('sums numeric object stats (hoursWorked)', () => {
    const week = makeWeek({
      '2024-01-15': { hoursWorked: { job1: 4, job2: 2 } },
      '2024-01-16': { hoursWorked: { job1: 3 } },
    });
    expect(sumStat(week, 'hoursWorked')).toBe(9);
  });

  it('returns 0 for empty days', () => {
    expect(sumStat(makeWeek({}), 'choreCompleted')).toBe(0);
  });
});
