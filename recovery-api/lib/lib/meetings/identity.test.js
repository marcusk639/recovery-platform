"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const identity_1 = require("./identity");
describe('normalizeDay', () => {
    it('passes through integers 0–6', () => {
        expect((0, identity_1.normalizeDay)(0)).toBe(0);
        expect((0, identity_1.normalizeDay)(6)).toBe(6);
    });
    it('parses numeric strings "0".."6"', () => {
        expect((0, identity_1.normalizeDay)('0')).toBe(0);
        expect((0, identity_1.normalizeDay)('3')).toBe(3);
    });
    it('parses full weekday names case-insensitively (0 = Sunday)', () => {
        expect((0, identity_1.normalizeDay)('Sunday')).toBe(0);
        expect((0, identity_1.normalizeDay)('monday')).toBe(1);
        expect((0, identity_1.normalizeDay)('  SATURDAY ')).toBe(6);
    });
    it('parses 3-letter weekday abbreviations', () => {
        expect((0, identity_1.normalizeDay)('Sun')).toBe(0);
        expect((0, identity_1.normalizeDay)('wed')).toBe(3);
    });
    it('throws on unrecognized input', () => {
        expect(() => (0, identity_1.normalizeDay)('someday')).toThrow();
        expect(() => (0, identity_1.normalizeDay)(7)).toThrow();
        expect(() => (0, identity_1.normalizeDay)(-1)).toThrow();
    });
});
describe('normalizeTime', () => {
    it('passes through "HH:mm"', () => {
        expect((0, identity_1.normalizeTime)('09:30')).toBe('09:30');
        expect((0, identity_1.normalizeTime)('23:00')).toBe('23:00');
    });
    it('zero-pads single-digit hours', () => {
        expect((0, identity_1.normalizeTime)('9:05')).toBe('09:05');
    });
    it('truncates seconds from "HH:mm:ss"', () => {
        expect((0, identity_1.normalizeTime)('18:45:00')).toBe('18:45');
    });
    it('converts 12-hour AM/PM to 24-hour', () => {
        expect((0, identity_1.normalizeTime)('9:00 AM')).toBe('09:00');
        expect((0, identity_1.normalizeTime)('12:00 AM')).toBe('00:00');
        expect((0, identity_1.normalizeTime)('12:00 PM')).toBe('12:00');
        expect((0, identity_1.normalizeTime)('7:30 pm')).toBe('19:30');
    });
    it('throws on invalid input', () => {
        expect(() => (0, identity_1.normalizeTime)('nope')).toThrow();
        expect(() => (0, identity_1.normalizeTime)('25:00')).toThrow();
        expect(() => (0, identity_1.normalizeTime)('10:99')).toThrow();
    });
});
describe('directoryGeohash', () => {
    it('produces a geohash at the frozen precision', () => {
        const gh = (0, identity_1.directoryGeohash)(40.7128, -74.006);
        expect(gh).toHaveLength(identity_1.GEOHASH_PRECISION);
        expect(identity_1.GEOHASH_PRECISION).toBe(10);
    });
    it('is deterministic for the same coordinates', () => {
        expect((0, identity_1.directoryGeohash)(34.05, -118.24)).toBe((0, identity_1.directoryGeohash)(34.05, -118.24));
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
        const a = (0, identity_1.directoryMeetingId)(base);
        const b = (0, identity_1.directoryMeetingId)(Object.assign({}, base));
        expect(a).toBe(b);
        expect(a).toHaveLength(24);
    });
    it('collapses equivalent day/time representations to the same id', () => {
        const numeric = (0, identity_1.directoryMeetingId)(base);
        const named = (0, identity_1.directoryMeetingId)(Object.assign(Object.assign({}, base), { day: 'Tuesday', time: '7:00 AM' }));
        expect(named).toBe(numeric);
    });
    it('changes the id when the day changes (day is deliberately in the key)', () => {
        expect((0, identity_1.directoryMeetingId)(Object.assign(Object.assign({}, base), { day: 3 }))).not.toBe((0, identity_1.directoryMeetingId)(base));
    });
    it('trims surrounding whitespace on name/address before hashing', () => {
        const padded = (0, identity_1.directoryMeetingId)(Object.assign(Object.assign({}, base), { name: '  Sunrise Group  ' }));
        expect(padded).toBe((0, identity_1.directoryMeetingId)(base));
    });
    it('treats missing link/address as empty (no throw)', () => {
        const id = (0, identity_1.directoryMeetingId)({ name: 'X', day: 0, time: '00:00' });
        expect(id).toHaveLength(24);
    });
    it('treats undefined link the same as empty string', () => {
        expect((0, identity_1.directoryMeetingId)(Object.assign(Object.assign({}, base), { link: undefined }))).toBe((0, identity_1.directoryMeetingId)(Object.assign(Object.assign({}, base), { link: '' })));
    });
    it('trims surrounding whitespace on formattedAddress before hashing', () => {
        const padded = (0, identity_1.directoryMeetingId)(Object.assign(Object.assign({}, base), { formattedAddress: '  123 Main St, Springfield, IL 62704  ' }));
        expect(padded).toBe((0, identity_1.directoryMeetingId)(base));
    });
    it('does not collide when a free-form field contains the legacy "|" separator', () => {
        // Pre-hardening these two could share a hash by shifting field boundaries.
        const a = (0, identity_1.directoryMeetingId)(Object.assign(Object.assign({}, base), { name: 'Sunrise|Group', formattedAddress: '' }));
        const b = (0, identity_1.directoryMeetingId)(Object.assign(Object.assign({}, base), { name: 'Sunrise', formattedAddress: 'Group' }));
        expect(a).not.toBe(b);
    });
});
// Regression coverage for iterative-review hardening (2026-06-20).
describe('normalizeDay — review hardening', () => {
    it('accepts 4-char abbreviations that are genuine prefixes', () => {
        expect((0, identity_1.normalizeDay)('Tues')).toBe(2);
        expect((0, identity_1.normalizeDay)('Thurs')).toBe(4);
    });
    it('throws on empty / whitespace-only input', () => {
        expect(() => (0, identity_1.normalizeDay)('')).toThrow();
        expect(() => (0, identity_1.normalizeDay)('   ')).toThrow();
    });
    it('throws on float and NaN', () => {
        expect(() => (0, identity_1.normalizeDay)(2.5)).toThrow();
        expect(() => (0, identity_1.normalizeDay)(Number.NaN)).toThrow();
    });
});
describe('normalizeTime — review hardening', () => {
    it('maps bare "0:00" (24-hour) to midnight', () => {
        expect((0, identity_1.normalizeTime)('0:00')).toBe('00:00');
    });
    it('rejects hour 0 with a meridiem (invalid 12-hour notation)', () => {
        // Intentional: 12-hour clock has hours 1–12. Use bare "0:00" for midnight.
        expect(() => (0, identity_1.normalizeTime)('0:00 AM')).toThrow();
        expect(() => (0, identity_1.normalizeTime)('0:00 PM')).toThrow();
    });
    it('rejects 12-hour values above 12', () => {
        expect(() => (0, identity_1.normalizeTime)('13:00 AM')).toThrow();
        expect(() => (0, identity_1.normalizeTime)('13:00 PM')).toThrow();
    });
});
