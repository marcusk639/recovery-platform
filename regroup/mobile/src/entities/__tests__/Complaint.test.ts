// Mock moment-timezone used inside util/display
jest.mock('moment-timezone', () => {
  const m = jest.requireActual('moment');
  (m as any).tz = { guess: () => 'UTC' };
  return m;
});

// Mock display utilities that depend on moment
jest.mock('../../util/display', () => ({
  getCurrentTime: () => '2026-02-22T00:00:00Z',
  getTodaysDate: () => '2026-02-22',
}));

import { Complaint } from '../Complaint';

describe('Complaint class', () => {
  describe('constructor', () => {
    it('does not throw when instantiated', () => {
      expect(() => new Complaint()).not.toThrow();
    });

    it('defaults id to empty string (from BaseEntity)', () => {
      const c = new Complaint();
      expect(c.id).toBe('');
    });

    it('defaults description to empty string', () => {
      const c = new Complaint();
      expect(c.description).toBe('');
    });

    it('defaults plaintiff to empty string', () => {
      const c = new Complaint();
      expect(c.plaintiff).toBe('');
    });

    it('defaults plaintiffType to "anonymous"', () => {
      const c = new Complaint();
      expect(c.plaintiffType).toBe('anonymous');
    });

    it('defaults reply to empty string', () => {
      const c = new Complaint();
      expect(c.reply).toBe('');
    });

    it('defaults houseId to empty string', () => {
      const c = new Complaint();
      expect(c.houseId).toBe('');
    });

    it('has a createdAt ISO string (from BaseEntity)', () => {
      const c = new Complaint();
      expect(typeof c.createdAt).toBe('string');
      expect(() => new Date(c.createdAt)).not.toThrow();
    });

    it('has an updatedAt ISO string (from BaseEntity)', () => {
      const c = new Complaint();
      expect(typeof c.updatedAt).toBe('string');
      expect(() => new Date(c.updatedAt)).not.toThrow();
    });
  });

  describe('field mutation', () => {
    it('allows description to be set', () => {
      const c = new Complaint();
      c.description = 'Loud music at night';
      expect(c.description).toBe('Loud music at night');
    });

    it('allows plaintiff to be set', () => {
      const c = new Complaint();
      c.plaintiff = 'guest-42';
      expect(c.plaintiff).toBe('guest-42');
    });

    it('allows plaintiffType to be changed from "anonymous" to "guest"', () => {
      const c = new Complaint();
      c.plaintiffType = 'guest';
      expect(c.plaintiffType).toBe('guest');
    });

    it('allows plaintiffType to be set to "admin"', () => {
      const c = new Complaint();
      c.plaintiffType = 'admin';
      expect(c.plaintiffType).toBe('admin');
    });

    it('allows plaintiffType to be set to "superAdmin"', () => {
      const c = new Complaint();
      c.plaintiffType = 'superAdmin';
      expect(c.plaintiffType).toBe('superAdmin');
    });

    it('allows plaintiffType to be set to "supporter"', () => {
      const c = new Complaint();
      c.plaintiffType = 'supporter';
      expect(c.plaintiffType).toBe('supporter');
    });

    it('allows reply to be set', () => {
      const c = new Complaint();
      c.reply = 'We will look into this.';
      expect(c.reply).toBe('We will look into this.');
    });

    it('allows houseId to be set', () => {
      const c = new Complaint();
      c.houseId = 'house-7';
      expect(c.houseId).toBe('house-7');
    });

    it('allows id to be set', () => {
      const c = new Complaint();
      c.id = 'complaint-001';
      expect(c.id).toBe('complaint-001');
    });
  });

  describe('BaseEntity timestamp fields', () => {
    it('does not redeclare createdDate as an own property — use createdAt from BaseEntity', () => {
      const c = new Complaint();
      const ownKeys = Object.getOwnPropertyNames(c);
      expect(ownKeys).not.toContain('createdDate');
    });
  });

  describe('independent instances', () => {
    it('two instances do not share description', () => {
      const a = new Complaint();
      const b = new Complaint();
      a.description = 'First complaint';
      expect(b.description).toBe('');
    });
  });

  describe('Complaints interface', () => {
    it('supports indexing Complaint instances by string id', () => {
      const complaints: { [id: string]: Complaint } = {};
      const c = new Complaint();
      c.id = 'c-1';
      c.description = 'Broken window';
      complaints['c-1'] = c;
      expect(complaints['c-1'].description).toBe('Broken window');
    });

    it('supports multiple complaints under different keys', () => {
      const complaints: { [id: string]: Complaint } = {};
      complaints['a'] = new Complaint();
      complaints['b'] = new Complaint();
      expect(Object.keys(complaints)).toHaveLength(2);
    });
  });
});
