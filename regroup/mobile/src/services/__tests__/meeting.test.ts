// src/services/__tests__/meeting.test.ts
//
// Unit tests for the meeting service.
//
// The service exports:
//   searchForMeetings  — calls callHttpsFunction('findMeetings', ...)
//   userIsAtMeeting    — calls functions.httpsCallable('userIsAtMeeting')(...)
//   addMeeting         — delegates to crud.create
//   updateMeeting      — delegates to crud.update
//   deleteMeeting      — delegates to crud.deleteObject
//
// callHttpsFunction and functions are both exported from firebase-setup.
// We mock that module inline so we can control return values per test.

// ─── Mocks (hoisted before imports) ─────────────────────────────────────────

jest.mock('../../../firebase-setup', () => {
  const mockHttpsCallable = jest.fn(() => Promise.resolve({ data: [] }));
  const httpsCallable = jest.fn(() => mockHttpsCallable);

  return {
    firestore: {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          id: 'generated-doc-id',
          set: jest.fn(() => Promise.resolve()),
          update: jest.fn(() => Promise.resolve()),
          delete: jest.fn(() => Promise.resolve()),
        })),
        where: jest.fn().mockReturnThis(),
        get: jest.fn(() => Promise.resolve({ docs: [] })),
        add: jest.fn(() => Promise.resolve({ id: 'mock-id' })),
      })),
    },
    functions: {
      httpsCallable,
      _mockHttpsCallable: mockHttpsCallable,
    },
    callHttpsFunction: jest.fn(() => Promise.resolve({ data: [] })),
  };
});

jest.mock('../crud', () => ({
  get: jest.fn(),
  getByAttribute: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deleteObject: jest.fn(),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { functions, callHttpsFunction } from '../../../firebase-setup';
import * as crud from '../crud';
import {
  searchForMeetings,
  userIsAtMeeting,
  addMeeting,
  updateMeeting,
  deleteMeeting,
} from '../meeting';
import { RatsMeeting, MeetingSearchInput, MeetingVerificationInput } from '../../entities/Meeting';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeMeeting = (overrides: Partial<RatsMeeting> = {}): RatsMeeting => ({
  id: 'm1',
  name: 'Monday NA',
  time: '19:00',
  street: '100 Recovery Rd',
  city: 'Chicago',
  state: 'IL',
  type: 'NA',
  day: 'Monday',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const makeSearchInput = (): MeetingSearchInput => ({
  location: { lat: 41.8781, lng: -87.6298, city: 'Chicago', state: 'IL' },
  filters: { distance: 10 } as any,
});

const makeVerificationInput = (): MeetingVerificationInput => ({
  userLocation: { lat: 41.8781, lng: -87.6298 },
  meetingLocation: { lat: 41.8782, lng: -87.6299 },
  meetingAddress: '100 Recovery Rd, Chicago IL',
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('meeting service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default resolved values after clearAllMocks
    (callHttpsFunction as jest.Mock).mockResolvedValue({ data: [] });
    const mockHttpsCallable = (functions as any)._mockHttpsCallable as jest.Mock;
    if (mockHttpsCallable) {
      mockHttpsCallable.mockResolvedValue({ data: {} });
    }
    (functions.httpsCallable as jest.Mock).mockReturnValue(
      (functions as any)._mockHttpsCallable,
    );
  });

  // ── searchForMeetings ─────────────────────────────────────────────────────

  describe('searchForMeetings', () => {
    it('calls callHttpsFunction with findMeetings and the search input', async () => {
      const searchInput = makeSearchInput();
      (callHttpsFunction as jest.Mock).mockResolvedValue({ data: [] });

      await searchForMeetings(searchInput);

      expect(callHttpsFunction).toHaveBeenCalledTimes(1);
      expect(callHttpsFunction).toHaveBeenCalledWith('findMeetings', searchInput);
    });

    it('returns the data array from the cloud function response', async () => {
      const meetings = [makeMeeting({ id: 'm1' }), makeMeeting({ id: 'm2' })];
      (callHttpsFunction as jest.Mock).mockResolvedValue({ data: meetings });

      const result = await searchForMeetings(makeSearchInput());

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('m1');
      expect(result[1].id).toBe('m2');
    });

    it('returns an empty array when the function returns no data', async () => {
      (callHttpsFunction as jest.Mock).mockResolvedValue({ data: [] });

      const result = await searchForMeetings(makeSearchInput());

      expect(result).toEqual([]);
    });

    it('propagates errors from callHttpsFunction', async () => {
      (callHttpsFunction as jest.Mock).mockRejectedValue(new Error('Cloud function error'));

      await expect(searchForMeetings(makeSearchInput())).rejects.toThrow('Cloud function error');
    });
  });

  // ── userIsAtMeeting ───────────────────────────────────────────────────────

  describe('userIsAtMeeting', () => {
    it('calls functions.httpsCallable with userIsAtMeeting', async () => {
      const locations = makeVerificationInput();

      await userIsAtMeeting(locations);

      expect(functions.httpsCallable).toHaveBeenCalledWith('userIsAtMeeting');
    });

    it('passes the location payload to the callable', async () => {
      const locations = makeVerificationInput();
      const innerFn = jest.fn(() => Promise.resolve({ data: { verified: true } }));
      (functions.httpsCallable as jest.Mock).mockReturnValue(innerFn);

      await userIsAtMeeting(locations);

      expect(innerFn).toHaveBeenCalledWith(locations);
    });

    it('returns the data from the callable response', async () => {
      const locations = makeVerificationInput();
      const innerFn = jest.fn(() => Promise.resolve({ data: { verified: true } }));
      (functions.httpsCallable as jest.Mock).mockReturnValue(innerFn);

      const result = await userIsAtMeeting(locations);

      expect(result).toEqual({ verified: true });
    });

    it('propagates errors from the callable', async () => {
      const innerFn = jest.fn(() => Promise.reject(new Error('Verification failed')));
      (functions.httpsCallable as jest.Mock).mockReturnValue(innerFn);

      await expect(userIsAtMeeting(makeVerificationInput())).rejects.toThrow('Verification failed');
    });
  });

  // ── addMeeting ────────────────────────────────────────────────────────────

  describe('addMeeting', () => {
    it('delegates to crud.create', async () => {
      const meeting = makeMeeting();
      (crud.create as jest.Mock).mockResolvedValue(meeting);

      await addMeeting(meeting);

      expect(crud.create).toHaveBeenCalledTimes(1);
    });

    it('passes the meeting to crud.create', async () => {
      const meeting = makeMeeting();
      (crud.create as jest.Mock).mockResolvedValue(meeting);

      await addMeeting(meeting);

      // The service uses _.cloneDeep, so check shape not reference equality
      expect(crud.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'm1', name: 'Monday NA' }),
      );
    });

    it('returns the created meeting', async () => {
      const meeting = makeMeeting();
      (crud.create as jest.Mock).mockResolvedValue(meeting);

      const result = await addMeeting(meeting);

      expect(result).toEqual(meeting);
    });

    it('passes a deep clone of the meeting (not the original reference)', async () => {
      const meeting = makeMeeting();
      (crud.create as jest.Mock).mockImplementation((_col, m) => Promise.resolve(m));

      await addMeeting(meeting);

      const passedMeeting = (crud.create as jest.Mock).mock.calls[0][1];
      expect(passedMeeting).not.toBe(meeting);
      expect(passedMeeting).toEqual(meeting);
    });

    it('propagates errors from crud.create', async () => {
      (crud.create as jest.Mock).mockRejectedValue(new Error('Create failed'));

      await expect(addMeeting(makeMeeting())).rejects.toThrow('Create failed');
    });
  });

  // ── updateMeeting ─────────────────────────────────────────────────────────

  describe('updateMeeting', () => {
    it('delegates to crud.update', async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await updateMeeting('m1', { name: 'Updated Meeting' });

      expect(crud.update).toHaveBeenCalledTimes(1);
    });

    it('merges meetingId into the values passed to crud.update', async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await updateMeeting('m1', { name: 'Updated Meeting' });

      expect(crud.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'm1', name: 'Updated Meeting' }),
      );
    });

    it('propagates errors from crud.update', async () => {
      (crud.update as jest.Mock).mockRejectedValue(new Error('Update failed'));

      await expect(updateMeeting('m1', { name: 'Fail' })).rejects.toThrow('Update failed');
    });
  });

  // ── deleteMeeting ─────────────────────────────────────────────────────────

  describe('deleteMeeting', () => {
    it('delegates to crud.deleteObject', async () => {
      (crud.deleteObject as jest.Mock).mockResolvedValue(undefined);
      const meeting = makeMeeting();

      await deleteMeeting(meeting);

      expect(crud.deleteObject).toHaveBeenCalledTimes(1);
    });

    it('passes the meeting object to crud.deleteObject', async () => {
      (crud.deleteObject as jest.Mock).mockResolvedValue(undefined);
      const meeting = makeMeeting();

      await deleteMeeting(meeting);

      expect(crud.deleteObject).toHaveBeenCalledWith(expect.anything(), meeting);
    });

    it('propagates errors from crud.deleteObject', async () => {
      (crud.deleteObject as jest.Mock).mockRejectedValue(new Error('Delete failed'));

      await expect(deleteMeeting(makeMeeting())).rejects.toThrow('Delete failed');
    });
  });
});
