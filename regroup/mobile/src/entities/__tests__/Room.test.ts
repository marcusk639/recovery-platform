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

import { Bed, Room } from '../Room';
import type { Beds, Rooms } from '../Room';

describe('Bed class', () => {
  describe('constructor', () => {
    it('does not throw when constructed with name and guestId', () => {
      expect(() => new Bed('Bed-A', 'guest-1')).not.toThrow();
    });

    it('sets id to the provided name', () => {
      const bed = new Bed('Bed-A', 'guest-1');
      expect(bed.id).toBe('Bed-A');
    });

    it('sets guestId to the provided value', () => {
      const bed = new Bed('Bed-A', 'guest-42');
      expect(bed.guestId).toBe('guest-42');
    });

    it('accepts null guestId', () => {
      const bed = new Bed('Bed-B', null as unknown as string);
      expect(bed.guestId).toBeNull();
    });

    it('does not set deprecated createdDate (use createdAt instead)', () => {
      const bed = new Bed('Bed-A', 'guest-1');
      expect(bed.createdDate).toBeUndefined();
    });

    it('has a createdAt ISO string (from BaseEntity)', () => {
      const bed = new Bed('Bed-A', 'guest-1');
      expect(typeof bed.createdAt).toBe('string');
      expect(() => new Date(bed.createdAt)).not.toThrow();
    });

    it('has an updatedAt ISO string (from BaseEntity)', () => {
      const bed = new Bed('Bed-A', 'guest-1');
      expect(typeof bed.updatedAt).toBe('string');
      expect(() => new Date(bed.updatedAt)).not.toThrow();
    });
  });

  describe('field mutation', () => {
    it('allows guestId to be updated to a new value', () => {
      const bed = new Bed('Bed-A', 'guest-1');
      bed.guestId = 'guest-99';
      expect(bed.guestId).toBe('guest-99');
    });

    it('allows guestId to be set to null', () => {
      const bed = new Bed('Bed-A', 'guest-1');
      bed.guestId = null;
      expect(bed.guestId).toBeNull();
    });

    it('allows modifiedDate to be set', () => {
      const bed = new Bed('Bed-A', 'guest-1');
      bed.modifiedDate = '2026-03-01T00:00:00Z';
      expect(bed.modifiedDate).toBe('2026-03-01T00:00:00Z');
    });
  });

  describe('Beds interface', () => {
    it('supports indexing Bed instances by name', () => {
      const beds: Beds = {};
      beds['Bed-A'] = new Bed('Bed-A', 'guest-1');
      expect(beds['Bed-A'].id).toBe('Bed-A');
    });

    it('supports multiple beds under different keys', () => {
      const beds: Beds = {
        'Bed-A': new Bed('Bed-A', 'guest-1'),
        'Bed-B': new Bed('Bed-B', 'guest-2'),
      };
      expect(Object.keys(beds)).toHaveLength(2);
    });
  });
});

describe('Room class', () => {
  describe('constructor with name only', () => {
    it('does not throw when constructed with just a name', () => {
      expect(() => new Room('Room-1')).not.toThrow();
    });

    it('sets id to the provided name', () => {
      const room = new Room('Living Room');
      expect(room.id).toBe('Living Room');
    });

    it('defaults beds to empty object when not provided', () => {
      const room = new Room('Room-1');
      expect(room.beds).toEqual({});
    });

    it('does not set deprecated createdDate (use createdAt instead)', () => {
      const room = new Room('Room-1');
      expect(room.createdDate).toBeUndefined();
    });

    it('has a createdAt ISO string (from BaseEntity)', () => {
      const room = new Room('Room-1');
      expect(typeof room.createdAt).toBe('string');
      expect(() => new Date(room.createdAt)).not.toThrow();
    });

    it('has an updatedAt ISO string (from BaseEntity)', () => {
      const room = new Room('Room-1');
      expect(typeof room.updatedAt).toBe('string');
      expect(() => new Date(room.updatedAt)).not.toThrow();
    });
  });

  describe('constructor with name and beds', () => {
    it('does not throw when beds are provided', () => {
      const beds: Beds = { 'Bed-A': new Bed('Bed-A', 'guest-1') };
      expect(() => new Room('Room-1', beds)).not.toThrow();
    });

    it('stores provided beds', () => {
      const beds: Beds = { 'Bed-A': new Bed('Bed-A', 'guest-1') };
      const room = new Room('Room-1', beds);
      expect(room.beds).toBe(beds);
    });

    it('correct bed is accessible by key', () => {
      const beds: Beds = { 'Bed-A': new Bed('Bed-A', 'guest-42') };
      const room = new Room('Room-1', beds);
      expect(room.beds['Bed-A'].guestId).toBe('guest-42');
    });

    it('multiple beds are stored', () => {
      const beds: Beds = {
        'Bed-A': new Bed('Bed-A', 'guest-1'),
        'Bed-B': new Bed('Bed-B', 'guest-2'),
      };
      const room = new Room('Room-1', beds);
      expect(Object.keys(room.beds)).toHaveLength(2);
    });
  });

  describe('field mutation', () => {
    it('allows id to be changed after construction', () => {
      const room = new Room('Room-1');
      room.id = 'Updated Room';
      expect(room.id).toBe('Updated Room');
    });

    it('allows beds to be replaced after construction', () => {
      const room = new Room('Room-1');
      const newBeds: Beds = { 'Bed-C': new Bed('Bed-C', 'guest-3') };
      room.beds = newBeds;
      expect(room.beds['Bed-C'].id).toBe('Bed-C');
    });

    it('allows a bed to be added to existing beds', () => {
      const room = new Room('Room-1');
      room.beds['Bed-A'] = new Bed('Bed-A', 'guest-1');
      expect(Object.keys(room.beds)).toHaveLength(1);
    });
  });

  describe('independent instances', () => {
    it('two rooms do not share beds object', () => {
      const roomA = new Room('Room-A');
      const roomB = new Room('Room-B');
      roomA.beds['Bed-X'] = new Bed('Bed-X', 'guest-1');
      expect(Object.keys(roomB.beds)).toHaveLength(0);
    });
  });

  describe('Rooms interface', () => {
    it('supports indexing Room instances by name', () => {
      const rooms: Rooms = {};
      rooms['Room-1'] = new Room('Room-1');
      expect(rooms['Room-1'].id).toBe('Room-1');
    });

    it('supports multiple rooms under different keys', () => {
      const rooms: Rooms = {
        'Room-1': new Room('Room-1'),
        'Room-2': new Room('Room-2'),
      };
      expect(Object.keys(rooms)).toHaveLength(2);
    });
  });
});
