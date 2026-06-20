import {
  GEOHASH_PRECISION,
  normalizeDay,
  normalizeTime,
  directoryGeohash,
  directoryMeetingId,
} from './identity';

describe('normalizeDay', () => {
  it('passes through integers 0–6', () => {
    expect(normalizeDay(0)).toBe(0);
    expect(normalizeDay(6)).toBe(6);
  });

  it('parses numeric strings "0".."6"', () => {
    expect(normalizeDay('0')).toBe(0);
    expect(normalizeDay('3')).toBe(3);
  });

  it('parses full weekday names case-insensitively (0 = Sunday)', () => {
    expect(normalizeDay('Sunday')).toBe(0);
    expect(normalizeDay('monday')).toBe(1);
    expect(normalizeDay('  SATURDAY ')).toBe(6);
  });

  it('parses 3-letter weekday abbreviations', () => {
    expect(normalizeDay('Sun')).toBe(0);
    expect(normalizeDay('wed')).toBe(3);
  });

  it('throws on unrecognized input', () => {
    expect(() => normalizeDay('someday')).toThrow();
    expect(() => normalizeDay(7)).toThrow();
    expect(() => normalizeDay(-1)).toThrow();
  });
});

describe('normalizeTime', () => {
  it('passes through "HH:mm"', () => {
    expect(normalizeTime('09:30')).toBe('09:30');
    expect(normalizeTime('23:00')).toBe('23:00');
  });

  it('zero-pads single-digit hours', () => {
    expect(normalizeTime('9:05')).toBe('09:05');
  });

  it('truncates seconds from "HH:mm:ss"', () => {
    expect(normalizeTime('18:45:00')).toBe('18:45');
  });

  it('converts 12-hour AM/PM to 24-hour', () => {
    expect(normalizeTime('9:00 AM')).toBe('09:00');
    expect(normalizeTime('12:00 AM')).toBe('00:00');
    expect(normalizeTime('12:00 PM')).toBe('12:00');
    expect(normalizeTime('7:30 pm')).toBe('19:30');
  });

  it('throws on invalid input', () => {
    expect(() => normalizeTime('nope')).toThrow();
    expect(() => normalizeTime('25:00')).toThrow();
    expect(() => normalizeTime('10:99')).toThrow();
  });
});

describe('directoryGeohash', () => {
  it('produces a geohash at the frozen precision', () => {
    const gh = directoryGeohash(40.7128, -74.006);
    expect(gh).toHaveLength(GEOHASH_PRECISION);
    expect(GEOHASH_PRECISION).toBe(10);
  });

  it('is deterministic for the same coordinates', () => {
    expect(directoryGeohash(34.05, -118.24)).toBe(directoryGeohash(34.05, -118.24));
  });
});

describe('directoryMeetingId', () => {
  const base = {
    name: 'Sunrise Group',
    day: 2,
    time: '07:00',
    link: 'https://example.org/meet',
    formattedAddress: '123 Main St, Springfield, IL 62704',
  };

  it('is pure and deterministic — same input → same 24-char id', () => {
    const a = directoryMeetingId(base);
    const b = directoryMeetingId({ ...base });
    expect(a).toBe(b);
    expect(a).toHaveLength(24);
  });

  it('collapses equivalent day/time representations to the same id', () => {
    const numeric = directoryMeetingId(base);
    const named = directoryMeetingId({ ...base, day: 'Tuesday', time: '7:00 AM' });
    expect(named).toBe(numeric);
  });

  it('changes the id when the day changes (day is deliberately in the key)', () => {
    expect(directoryMeetingId({ ...base, day: 3 })).not.toBe(directoryMeetingId(base));
  });

  it('trims surrounding whitespace on name/address before hashing', () => {
    const padded = directoryMeetingId({ ...base, name: '  Sunrise Group  ' });
    expect(padded).toBe(directoryMeetingId(base));
  });

  it('treats missing link/address as empty (no throw)', () => {
    const id = directoryMeetingId({ name: 'X', day: 0, time: '00:00' });
    expect(id).toHaveLength(24);
  });
});
