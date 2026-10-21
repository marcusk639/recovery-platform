// src/services/__tests__/setup-wizard-photos.test.ts

const mockUpdate = jest.fn();
const mockDoc = jest.fn((_id: string) => ({ update: mockUpdate }));
jest.mock('../house', () => ({
  houseCollection: { doc: (id: string) => mockDoc(id) },
}));
jest.mock('../storage', () => ({ uploadHousePhoto: jest.fn() }));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { uploadHousePhoto } from '../storage';
import { logException } from '../../util/logging';
import { applyHousePhotos } from '../setup-wizard-photos';
import { Houses } from '../../types';

const houses = (): Houses =>
  ({
    a: { id: 'a', name: 'A', imageUrl: 'file://a.jpg', avatar: 'file://a.jpg' },
    b: { id: 'b', name: 'B', imageUrl: 'file://b.jpg' },
    c: { id: 'c', name: 'C', imageUrl: '' },
  } as unknown as Houses);

beforeEach(() => {
  jest.clearAllMocks();
  (uploadHousePhoto as jest.Mock).mockImplementation((_uri: string, h: { id: string }) =>
    Promise.resolve({ houseId: h.id, url: `https://cdn/${h.id}` }),
  );
  mockUpdate.mockResolvedValue(undefined);
});

describe('applyHousePhotos', () => {
  it('uploads only houses with a photo and applies every success', async () => {
    const hs = houses();
    await expect(applyHousePhotos(hs)).resolves.toBe(0);

    expect(uploadHousePhoto).toHaveBeenCalledTimes(2);
    expect(mockDoc.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
    expect(hs.a).toMatchObject({ imageUrl: 'https://cdn/a', avatar: 'https://cdn/a' });
    expect(hs.b).toMatchObject({ imageUrl: 'https://cdn/b', avatar: 'https://cdn/b' });
    expect(logException).not.toHaveBeenCalled();
  });

  it('a failed upload does not stop the others and clears the local path', async () => {
    (uploadHousePhoto as jest.Mock).mockRejectedValueOnce(new Error('upload failed'));
    const hs = houses();
    await expect(applyHousePhotos(hs)).resolves.toBe(1);

    expect(hs.a).toMatchObject({ imageUrl: '', avatar: '' });
    expect(hs.b).toMatchObject({ imageUrl: 'https://cdn/b' });
    expect(mockDoc.mock.calls.map(([id]) => id)).toEqual(['b']);
    expect(logException).toHaveBeenCalledWith(
      expect.any(Error),
      'initializeHouses: photo failed house=a stage=upload',
    );
  });

  it('logs only the upload error code/name, never its message (it may hold the local file path)', async () => {
    (uploadHousePhoto as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('file:///var/mobile/Containers/photo.jpg does not exist'), {
        code: 'storage/unknown',
      }),
    );
    await applyHousePhotos(houses());

    const [logged] = (logException as jest.Mock).mock.calls[0];
    expect(logged.message).toContain('storage/unknown');
    expect(logged.message).not.toContain('file://');
    expect(logged.message).not.toContain('photo.jpg');
  });

  it('a failed house update counts as a failure and clears the url', async () => {
    mockUpdate.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    const hs = houses();
    await expect(applyHousePhotos(hs)).resolves.toBe(1);

    expect(hs.a).toMatchObject({ imageUrl: 'https://cdn/a' });
    expect(hs.b).toMatchObject({ imageUrl: '', avatar: '' });
    expect(logException).toHaveBeenCalledWith(
      expect.any(Error),
      'initializeHouses: photo failed house=b stage=update',
    );
  });
});
