// src/services/__tests__/choreRotation.test.ts

jest.mock('../../../firebase-setup', () => {
  const _mockDoc = {
    id: 'house1',
    get: jest.fn(),
    set: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
  };

  const _mockCollection = {
    doc: jest.fn(() => _mockDoc),
    _mockDoc,
  };

  return {
    firestore: {
      collection: jest.fn(() => _mockCollection),
      _mockCollection,
    },
  };
});

jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { firestore } from '../../../firebase-setup';
import {
  getRotation,
  setRotationOrder,
  advanceRotation,
  getCurrentAssignee,
} from '../choreRotation';

const _col = (firestore as any)._mockCollection;
const _doc = () => _col._mockDoc;

const makeRotation = (overrides = {}) => ({
  choreName: 'Kitchen',
  guestIds: ['guest1', 'guest2', 'guest3'],
  currentIndex: 0,
  lastRotatedAt: '2026-05-17',
  ...overrides,
});

afterEach(() => jest.clearAllMocks());

describe('getRotation', () => {
  it('returns null when the document does not exist', async () => {
    _doc().get.mockResolvedValueOnce({ exists: false, data: () => null });
    const result = await getRotation('house1');
    expect(result).toBeNull();
  });

  it('returns the rotation when the document exists', async () => {
    const rotation = makeRotation();
    _doc().get.mockResolvedValueOnce({ exists: true, data: () => rotation });
    const result = await getRotation('house1');
    expect(result).toEqual(rotation);
  });

  it('throws a wrapped error when Firestore fails', async () => {
    _doc().get.mockRejectedValueOnce(new Error('Network error'));
    await expect(getRotation('house1')).rejects.toThrow(
      'Failed to fetch chore rotation',
    );
  });
});

describe('setRotationOrder', () => {
  it('writes the rotation document with currentIndex 0', async () => {
    await setRotationOrder('house1', 'Kitchen', ['guest1', 'guest2']);
    expect(_doc().set).toHaveBeenCalledWith(
      expect.objectContaining({
        choreName: 'Kitchen',
        guestIds: ['guest1', 'guest2'],
        currentIndex: 0,
      }),
    );
  });

  it('throws a wrapped error when Firestore set fails', async () => {
    _doc().set.mockRejectedValueOnce(new Error('Permission denied'));
    await expect(
      setRotationOrder('house1', 'Kitchen', ['guest1']),
    ).rejects.toThrow('Failed to set rotation order');
  });
});

describe('advanceRotation', () => {
  it('increments currentIndex by 1', async () => {
    const rotation = makeRotation({ currentIndex: 0 });
    _doc().get.mockResolvedValueOnce({ exists: true, data: () => rotation });
    await advanceRotation('house1');
    expect(_doc().update).toHaveBeenCalledWith(
      expect.objectContaining({ currentIndex: 1 }),
    );
  });

  it('wraps index back to 0 after the last guest', async () => {
    const rotation = makeRotation({
      currentIndex: 2,
      guestIds: ['g1', 'g2', 'g3'],
    });
    _doc().get.mockResolvedValueOnce({ exists: true, data: () => rotation });
    await advanceRotation('house1');
    expect(_doc().update).toHaveBeenCalledWith(
      expect.objectContaining({ currentIndex: 0 }),
    );
  });

  it('throws when no rotation document exists', async () => {
    _doc().get.mockResolvedValueOnce({ exists: false, data: () => null });
    await expect(advanceRotation('house1')).rejects.toThrow(
      'Failed to advance chore rotation',
    );
  });
});

describe('getCurrentAssignee', () => {
  it('returns the guestId at currentIndex', async () => {
    const rotation = makeRotation({ currentIndex: 1 });
    _doc().get.mockResolvedValueOnce({ exists: true, data: () => rotation });
    const result = await getCurrentAssignee('house1');
    expect(result).toBe('guest2');
  });

  it('returns null when no rotation document exists', async () => {
    _doc().get.mockResolvedValueOnce({ exists: false, data: () => null });
    const result = await getCurrentAssignee('house1');
    expect(result).toBeNull();
  });

  it('returns null when guestIds is empty', async () => {
    const rotation = makeRotation({ guestIds: [], currentIndex: 0 });
    _doc().get.mockResolvedValueOnce({ exists: true, data: () => rotation });
    const result = await getCurrentAssignee('house1');
    expect(result).toBeNull();
  });
});
