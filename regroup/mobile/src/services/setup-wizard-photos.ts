import { Houses } from '../types';
import { houseCollection } from './house';
import { uploadHousePhoto } from './storage';
import { logException } from '../util/logging';

/**
 * Best-effort photo step of initializeHouses: uploads each house's local photo
 * and writes the download URL to the house. Setup is already complete without
 * photos, so nothing here throws. Mutates `houses` in place: a house whose
 * upload or update failed gets imageUrl/avatar '' (never a local file:// path).
 * The log message carries house id + stage; the logged error carries only the
 * original error's code/name, since its message may hold the local file path.
 * Returns the number of houses whose photo failed.
 */
export const applyHousePhotos = async (houses: Houses): Promise<number> => {
  const withPhoto = Object.values(houses).filter((house) => !!house.imageUrl);
  let failures = 0;
  const fail = (houseId: string, stage: string, error: unknown) => {
    failures += 1;
    houses[houseId].imageUrl = '';
    houses[houseId].avatar = '';
    const { code, name } = (error ?? {}) as { code?: unknown; name?: unknown };
    logException(
      new Error(
        `photo ${stage} failed code=${String(code ?? 'unknown')} name=${String(name ?? '')}`,
      ),
      `initializeHouses: photo failed house=${houseId} stage=${stage}`,
    );
  };

  const uploads = await Promise.allSettled(
    withPhoto.map((house) => uploadHousePhoto(house.imageUrl, house)),
  );
  const uploaded: { houseId: string; url: string }[] = [];
  uploads.forEach((result, i) => {
    const houseId = withPhoto[i].id;
    if (result.status === 'fulfilled') {
      uploaded.push({ houseId, url: result.value.url });
    } else {
      fail(houseId, 'upload', result.reason);
    }
  });

  const updates = await Promise.allSettled(
    uploaded.map(({ houseId, url }) =>
      houseCollection.doc(houseId).update({ imageUrl: url, avatar: url }),
    ),
  );
  updates.forEach((result, i) => {
    const { houseId, url } = uploaded[i];
    if (result.status === 'fulfilled') {
      houses[houseId].imageUrl = url;
      houses[houseId].avatar = url;
    } else {
      fail(houseId, 'update', result.reason);
    }
  });
  return failures;
};
