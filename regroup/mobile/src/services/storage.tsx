import { handleError } from './errors/storage';
import { House } from '../entities/House';
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  putFile,
  ref,
  type SettableMetadata,
} from '@react-native-firebase/storage';

// Example house reference: rats-dev.appspot.com/houses/{houseId}
// Example guest reference: rats-dev.appspot.com/houses/{houseId}/guests/{guestId}
// Example chore reference: rats-dev.appspot.com/houses/{houseId}/chore-evidence/{userId}/{fileName}

const bucket = ref(getStorage());
const housesRef = ref(getStorage(), 'houses');
// const guestsRef = storage.ref('guests');

const guestAvatarRefUrl = (houseId: string, guestId: string) =>
  `houses/${houseId}/guests/${guestId}/avatar/${guestId}_avatar`;
const getGuestAvatarUrl = (
  houseId: string,
  guestId: string,
  fileName: string,
) => `houses/${houseId}/guests/${guestId}/avatar/${fileName}`;
const getHouseLogoUrl = (houseId: string, fileName: string) =>
  `houses/${houseId}/logo/${fileName}`;
const getHousePhotoUrl = (houseId: string) => `houses/${houseId}/photo`;
const getUserAvatarUrl = (userId: string) => `users/${userId}/avatar`;

export const getGuestAvatarDownloadURL = async (
  houseId: string,
  guestId: string,
  fileName?: string,
) => {
  fileName = fileName || `${guestId}_avatar`;
  const avatarRef = ref(
    getStorage(),
    getGuestAvatarUrl(houseId, guestId, fileName),
  );
  try {
    return await getDownloadURL(avatarRef);
    // console.log('AVATAR URL', avatarUrl);
  } catch (error) {
    handleError(error);
  }
};

export const uploadPhoto = async (
  url: string,
  pathOnDevice: string,
  metadata?: SettableMetadata,
) => {
  return putFile(ref(getStorage(), url), pathOnDevice, {
    cacheControl: 'public, max-age=31536000',
    ...(metadata || {}),
  });
};

export const uploadUserAvatar = async (
  pathOnDevice: string,
  userId: string,
  metadata?: SettableMetadata,
) => {
  return uploadPhoto(getUserAvatarUrl(userId), pathOnDevice, metadata);
};

// storage.rules: users/{uid}/avatar is written and read by its owner only, so
// the owner reads its download URL once, here, and stores that in the user doc
// (and the guest/admin copies); everyone else shows the URL.
export const uploadUserAvatarAndGetUrl = async (
  pathOnDevice: string,
  userId: string,
  metadata?: SettableMetadata,
): Promise<string> => {
  await uploadUserAvatar(pathOnDevice, userId, metadata);
  return getDownloadURL(ref(getStorage(), getUserAvatarUrl(userId)));
};

/** Deletes users/{uid}/avatar (its owner may: storage.rules). */
export const deleteUserAvatar = async (userId: string): Promise<void> =>
  deleteObject(ref(getStorage(), getUserAvatarUrl(userId)));

export const uploadGuestAvatar = async (
  pathOnDevice: string,
  houseId: string,
  guestId: string,
  metadata?: SettableMetadata,
) => {
  return uploadPhoto(
    guestAvatarRefUrl(houseId, guestId),
    pathOnDevice,
    metadata,
  );
};

// storage.rules: only the resident (userId = their account, holding the
// house's guest claim) writes their own folder; house members read it.
const getChoreEvidenceUrl = (houseId: string, userId: string, fileName: string) =>
  `houses/${houseId}/chore-evidence/${userId}/${fileName}`;

export const uploadChoreEvidencePhoto = async (
  pathOnDevice: string,
  houseId: string,
  userId: string,
  fileName: string,
  metadata?: SettableMetadata,
): Promise<string> => {
  const storagePath = getChoreEvidenceUrl(houseId, userId, fileName);
  await uploadPhoto(storagePath, pathOnDevice, metadata);
  return getDownloadURL(ref(getStorage(), storagePath));
};

export const uploadHousePhoto = async (
  pathOnDevice: string,
  house: Partial<House>,
  metadata?: SettableMetadata,
) => {
  const item = await uploadPhoto(
    getHousePhotoUrl(house.id!),
    pathOnDevice,
    metadata,
  );
  const url = await getDownloadURL(ref(getStorage(), item.metadata.fullPath));
  return { houseId: house.id!, url };
};
