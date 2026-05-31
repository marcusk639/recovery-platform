// src/services/__tests__/applications.test.ts

jest.mock('../../util/logging', () => ({
  logException: jest.fn(),
}));

jest.mock('../../../firebase-setup', () => {
  const mockSet = jest.fn().mockResolvedValue(undefined);
  const mockUpdate = jest.fn().mockResolvedValue(undefined);
  const mockGet = jest.fn();
  const mockOrderBy = jest.fn(() => ({ get: mockGet }));
  const mockWhere = jest.fn(() => ({ orderBy: mockOrderBy, get: mockGet }));
  const mockAppDoc = jest.fn(() => ({
    set: mockSet,
    update: mockUpdate,
    id: 'generated-app-id',
  }));
  const mockAppCollection = jest.fn(() => ({
    doc: mockAppDoc,
    orderBy: mockOrderBy,
  }));
  const mockHouseDoc = jest.fn(() => ({ collection: mockAppCollection }));
  const mockHousesCollection = jest.fn(() => ({ doc: mockHouseDoc }));
  const mockCollectionGroup = jest.fn(() => ({ where: mockWhere }));
  const mockAuthObj = { currentUser: { uid: 'applicant-uid-1' } };

  return {
    firestore: {
      collection: mockHousesCollection,
      collectionGroup: mockCollectionGroup,
      _mockSet: mockSet,
      _mockUpdate: mockUpdate,
      _mockGet: mockGet,
      _mockWhere: mockWhere,
    },
    auth: mockAuthObj,
    _mockAuth: mockAuthObj,
  };
});

import { firestore } from '../../../firebase-setup';
import {
  submitApplication,
  listHouseApplications,
  getMyApplications,
  updateApplicationStatus,
} from '../applications';
import { HouseApplication } from '../../entities/Application';

const getSet = () => (firestore as any)._mockSet as jest.Mock;
const getUpdate = () => (firestore as any)._mockUpdate as jest.Mock;
const getGet = () => (firestore as any)._mockGet as jest.Mock;
const getMockAuth = () => (require('../../../firebase-setup') as any)._mockAuth;

const baseData = {
  applicantName: 'Alice Smith',
  applicantEmail: 'alice@example.com',
  applicantPhone: '555-0100',
  sobrietyDate: '2023-06-15',
  programType: 'AA' as const,
  currentSituation: 'Transitioning out of a 30-day program',
  references: 'John (sponsor): 555-0199',
};

describe('applications service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getMockAuth().currentUser = { uid: 'applicant-uid-1' };
  });

  describe('submitApplication', () => {
    it('writes a document to houses/{houseId}/applications', async () => {
      await submitApplication('house-1', baseData);

      expect(firestore.collection).toHaveBeenCalledWith('houses');
      expect(getSet()).toHaveBeenCalledWith(
        expect.objectContaining({
          applicantUid: 'applicant-uid-1',
          houseId: 'house-1',
          status: 'pending',
          applicantName: 'Alice Smith',
        }),
      );
    });

    it('sets createdAt to a valid ISO string', async () => {
      await submitApplication('house-1', baseData);
      const written = getSet().mock.calls[0][0];
      expect(new Date(written.createdAt).toISOString()).toBe(written.createdAt);
    });

    it('returns the generated application id', async () => {
      const id = await submitApplication('house-1', baseData);
      expect(id).toBe('generated-app-id');
    });

    it('throws if user is not authenticated', async () => {
      getMockAuth().currentUser = null;
      await expect(submitApplication('house-1', baseData)).rejects.toThrow(
        'Must be signed in to apply',
      );
    });

    it('calls logException and rethrows on Firestore error', async () => {
      const { logException } = require('../../util/logging');
      getSet().mockRejectedValue(new Error('Firestore unavailable'));
      await expect(submitApplication('house-1', baseData)).rejects.toThrow(
        'Failed to submit application. Please try again.',
      );
      expect(logException).toHaveBeenCalled();
    });
  });

  describe('listHouseApplications', () => {
    it('queries the subcollection ordered by createdAt desc', async () => {
      const app = new HouseApplication();
      app.id = 'app-1';
      app.applicantName = 'Alice';
      getGet().mockResolvedValue({ docs: [{ data: () => app }] });

      const result = await listHouseApplications('house-1');

      expect(firestore.collection).toHaveBeenCalledWith('houses');
      expect(result).toHaveLength(1);
      expect(result[0].applicantName).toBe('Alice');
    });

    it('returns empty array when no applications exist', async () => {
      getGet().mockResolvedValue({ docs: [] });
      const result = await listHouseApplications('house-1');
      expect(result).toEqual([]);
    });
  });

  describe('getMyApplications', () => {
    it('uses a collection group query filtered by applicantUid', async () => {
      getGet().mockResolvedValue({ docs: [] });
      await getMyApplications();

      expect(firestore.collectionGroup).toHaveBeenCalledWith('applications');
      expect((firestore as any)._mockWhere).toHaveBeenCalledWith(
        'applicantUid',
        '==',
        'applicant-uid-1',
      );
    });

    it('returns empty array if user is not authenticated', async () => {
      getMockAuth().currentUser = null;
      const result = await getMyApplications();
      expect(result).toEqual([]);
    });
  });

  describe('updateApplicationStatus', () => {
    it('updates status, reviewedAt, reviewedBy, and operatorNote', async () => {
      await updateApplicationStatus(
        'house-1',
        'app-1',
        'approved',
        'Great fit!',
      );

      expect(getUpdate()).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'approved',
          operatorNote: 'Great fit!',
          reviewedBy: 'applicant-uid-1',
        }),
      );
      expect(getUpdate().mock.calls[0][0].reviewedAt).toBeTruthy();
    });

    it('defaults operatorNote to empty string when note is omitted', async () => {
      await updateApplicationStatus('house-1', 'app-1', 'rejected');
      expect(getUpdate()).toHaveBeenCalledWith(
        expect.objectContaining({ operatorNote: '' }),
      );
    });

    it('throws if user is not authenticated', async () => {
      getMockAuth().currentUser = null;
      await expect(
        updateApplicationStatus('house-1', 'app-1', 'approved'),
      ).rejects.toThrow('Must be signed in to update application status');
    });
  });
});
