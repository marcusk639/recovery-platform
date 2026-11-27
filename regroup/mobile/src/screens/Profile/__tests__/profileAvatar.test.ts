/**
 * The profile avatar is uploaded to users/{uid}/avatar and saved as its
 * download URL, never as the phone's file path. Runs the real storage service
 * against the firebase-modular storage mock (download URL =
 * https://mock-storage/<path>).
 */
jest.mock('../../../../firebase-setup', () =>
  require('../../../../__mocks__/firebase-modular/setup'),
);
jest.mock('@react-native-firebase/storage', () =>
  require('../../../../__mocks__/firebase-modular/storage'),
);
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));

import * as rnfbStorage from '@react-native-firebase/storage';
import {
  avatarContentType,
  avatarForSave,
  deleteRemovedAvatar,
  isRemoteImageUri,
  versionedAvatarUrl,
} from '../profileAvatar';
import { uploadUserAvatarAndGetUrl } from '../../../services/storage';
import { logException } from '../../../util/logging';

const PICKED = 'file:///var/mobile/tmp/IMG_0001.jpg';
const VERSIONED = /^https:\/\/mock-storage\/users\/u1\/avatar\?v=\d+$/;
const STORED_URL = 'https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fu1%2Favatar?alt=media';

afterEach(() => {
  jest.restoreAllMocks();
  (logException as jest.Mock).mockClear();
});

describe('uploadUserAvatarAndGetUrl', () => {
  it("uploads to users/{uid}/avatar and returns that file's download URL", async () => {
    const putFile = jest.spyOn(rnfbStorage, 'putFile');
    await expect(
      uploadUserAvatarAndGetUrl(PICKED, 'u1', { contentType: 'image/jpeg' }),
    ).resolves.toBe('https://mock-storage/users/u1/avatar');
    expect(putFile).toHaveBeenCalledWith(
      expect.anything(),
      PICKED,
      expect.objectContaining({ contentType: 'image/jpeg' }),
    );
  });
});

describe('avatarForSave', () => {
  it('uploads a newly picked photo and returns its URL, with an image content type', async () => {
    const putFile = jest.spyOn(rnfbStorage, 'putFile');
    await expect(avatarForSave(PICKED, '', 'u1', 'image/png')).resolves.toMatch(VERSIONED);
    expect(putFile.mock.calls[0][2]).toMatchObject({ contentType: 'image/png' });
  });

  it('replaces an older photo', async () => {
    await expect(avatarForSave(PICKED, STORED_URL, 'u1')).resolves.toMatch(VERSIONED);
  });

  it('keeps a removed avatar removed, without uploading', async () => {
    const putFile = jest.spyOn(rnfbStorage, 'putFile');
    await expect(avatarForSave('', STORED_URL, 'u1')).resolves.toBe('');
    expect(putFile).not.toHaveBeenCalled();
  });

  it('keeps a URL as it is, without uploading', async () => {
    const putFile = jest.spyOn(rnfbStorage, 'putFile');
    await expect(avatarForSave(STORED_URL, STORED_URL, 'u1')).resolves.toBe(STORED_URL);
    await expect(avatarForSave(STORED_URL, '', 'u1')).resolves.toBe(STORED_URL);
    expect(putFile).not.toHaveBeenCalled();
  });

  it("leaves an older build's stored phone path alone (the file may be gone)", async () => {
    const putFile = jest.spyOn(rnfbStorage, 'putFile');
    await expect(avatarForSave(PICKED, PICKED, 'u1')).resolves.toBe(PICKED);
    expect(putFile).not.toHaveBeenCalled();
  });

  it('saves each new photo as a new URL, so no phone keeps showing a cached old one', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    const first = await avatarForSave(PICKED, '', 'u1');
    const second = await avatarForSave('file:///var/mobile/tmp/IMG_0002.jpg', first, 'u1');
    expect(first).toBe('https://mock-storage/users/u1/avatar?v=1000');
    expect(second).toBe('https://mock-storage/users/u1/avatar?v=2000');
  });

  it('refuses to upload with no signed-in account', async () => {
    const putFile = jest.spyOn(rnfbStorage, 'putFile');
    await expect(avatarForSave(PICKED, '', '')).rejects.toThrow('no signed-in account');
    expect(putFile).not.toHaveBeenCalled();
  });

  it('throws when the upload fails, so nothing is saved', async () => {
    jest.spyOn(rnfbStorage, 'putFile').mockImplementationOnce(() => {
      throw Object.assign(new Error('storage/unauthorized'), { code: 'storage/unauthorized' });
    });
    await expect(avatarForSave(PICKED, '', 'u1')).rejects.toThrow('storage/unauthorized');
  });
});

describe('avatarContentType', () => {
  it("uses the picker's image type", () => {
    expect(avatarContentType(PICKED, 'image/heic')).toBe('image/heic');
  });

  it('falls back to the extension, then JPEG', () => {
    expect(avatarContentType('file:///x/a.PNG', undefined)).toBe('image/png');
    expect(avatarContentType('file:///x/a.webp?x=1', null)).toBe('image/webp');
    expect(avatarContentType('content://media/42', undefined)).toBe('image/jpeg');
    expect(avatarContentType('file:///x/a.jpg', 'application/octet-stream')).toBe('image/jpeg');
  });
});

describe('isRemoteImageUri', () => {
  it('is true only for http(s) URLs', () => {
    expect(isRemoteImageUri(STORED_URL)).toBe(true);
    expect(isRemoteImageUri('http://127.0.0.1:9199/v0/b/x/o/y')).toBe(true);
    expect(isRemoteImageUri(PICKED)).toBe(false);
    expect(isRemoteImageUri('/data/user/0/app/cache/a.jpg')).toBe(false);
    expect(isRemoteImageUri('')).toBe(false);
    expect(isRemoteImageUri(undefined)).toBe(false);
  });
});

describe('versionedAvatarUrl', () => {
  it('adds the version to a URL with or without a query', () => {
    expect(versionedAvatarUrl('https://x/o/a?alt=media&token=t', 5)).toBe(
      'https://x/o/a?alt=media&token=t&v=5',
    );
    expect(versionedAvatarUrl('https://x/o/a', 5)).toBe('https://x/o/a?v=5');
  });
});

describe('deleteRemovedAvatar', () => {
  it('deletes users/{uid}/avatar after a save that removed the photo', async () => {
    const del = jest.spyOn(rnfbStorage, 'deleteObject');
    await deleteRemovedAvatar('', STORED_URL, 'u1');
    expect(del).toHaveBeenCalledTimes(1);
    expect((del.mock.calls[0][0] as { fullPath?: string }).fullPath).toBe('users/u1/avatar');
  });

  it('deletes nothing when a photo is kept, there was none, or the old value was a phone path', async () => {
    const del = jest.spyOn(rnfbStorage, 'deleteObject');
    await deleteRemovedAvatar(STORED_URL, STORED_URL, 'u1');
    await deleteRemovedAvatar('', '', 'u1');
    await deleteRemovedAvatar('', PICKED, 'u1');
    await deleteRemovedAvatar('', STORED_URL, '');
    expect(del).not.toHaveBeenCalled();
  });

  it('ignores a file that is already gone', async () => {
    jest.spyOn(rnfbStorage, 'deleteObject').mockRejectedValueOnce(
      Object.assign(new Error('gone'), { code: 'storage/object-not-found' }),
    );
    await expect(deleteRemovedAvatar('', STORED_URL, 'u1')).resolves.toBeUndefined();
    expect(logException).not.toHaveBeenCalled();
  });

  it('logs any other failure and never throws (the profile is already saved)', async () => {
    const error = Object.assign(new Error('nope'), { code: 'storage/unauthorized' });
    jest.spyOn(rnfbStorage, 'deleteObject').mockRejectedValueOnce(error);
    await expect(deleteRemovedAvatar('', STORED_URL, 'u1')).resolves.toBeUndefined();
    expect(logException).toHaveBeenCalledWith(error, expect.any(String));
  });
});
