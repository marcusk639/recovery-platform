// The profile form's avatar: the picker gives a file on the phone, which only
// that phone can show. Saving uploads it to users/{uid}/avatar (storage.rules:
// the owner writes images up to 5 MB) and stores the download URL instead, the
// way the chore photo stores its URL.
import { deleteUserAvatar, uploadUserAvatarAndGetUrl } from '../../services/storage';
import { logException } from '../../util/logging';

/** A URL any phone can load. Anything else is a path on the phone that picked it. */
export const isRemoteImageUri = (uri: unknown): uri is string =>
  typeof uri === 'string' && /^https?:\/\//i.test(uri);

const TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/**
 * The upload's content type (storage.rules accept only image/*): the picker's
 * own type when it gave one, else from the file extension, else JPEG (what
 * the picker writes by default).
 */
export const avatarContentType = (uri: string, pickedType?: string | null): string => {
  if (pickedType && /^image\//i.test(pickedType)) return pickedType;
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return TYPES_BY_EXTENSION[ext] ?? 'image/jpeg';
};

/**
 * Every photo goes to the same path, users/{uid}/avatar, which may keep its
 * download URL when it is replaced; a phone that cached the old image (the
 * upload sets a one-year cache) would go on showing it. A version parameter,
 * which Storage ignores, makes each saved photo a new URL.
 */
export const versionedAvatarUrl = (url: string, now: number = Date.now()): string =>
  `${url}${url.includes('?') ? '&' : '?'}v=${now}`;

/**
 * The avatar value to save. A newly picked photo is uploaded and its download
 * URL returned; uploading throws, so the caller can say so and save nothing.
 * An empty value (removed), a URL, or the value already stored is returned as
 * it is: an older build stored the phone's path, and re-saving the profile
 * must not try to upload a file that may be gone.
 */
export async function avatarForSave(
  avatar: string | null | undefined,
  storedAvatar: string | null | undefined,
  uid: string,
  pickedType?: string | null,
): Promise<string | null | undefined> {
  if (!avatar || avatar === storedAvatar || isRemoteImageUri(avatar)) return avatar;
  if (!uid) throw new Error('profileAvatar: no signed-in account to upload as');
  const url = await uploadUserAvatarAndGetUrl(avatar, uid, {
    contentType: avatarContentType(avatar, pickedType),
  });
  return versionedAvatarUrl(url);
}

/**
 * After a save that removed the photo, deletes it from Storage, so its URL
 * stops working. Best effort: never throws (the profile is already saved);
 * a missing file is fine, any other failure is logged.
 */
export async function deleteRemovedAvatar(
  savedAvatar: string | null | undefined,
  storedAvatar: string | null | undefined,
  uid: string,
): Promise<void> {
  if (savedAvatar || !uid || !isRemoteImageUri(storedAvatar)) return;
  try {
    await deleteUserAvatar(uid);
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== 'storage/object-not-found') {
      logException(error, 'profileAvatar: removed avatar not deleted');
    }
  }
}
