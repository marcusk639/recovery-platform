import { firestore, functions } from '../../firebase-setup';
import { houseCollection } from './house';
import { Houses } from '../types';
import { cloneDeep, each, map } from 'lodash';
import { User } from '../entities/User';
import { getInitialPhase } from '../util/house';
import { createInvitation, CreateInvitationResult } from './invitations';
import { adminCollection, getAdmin } from './admin';
import Admin from '../entities/Admin';
import '@react-native-firebase/firestore';
import { uploadHousePhoto } from './storage';
import { logException } from '../util/logging';
import { refreshClaims, getAuthUser } from './users';
import { Guest } from '../entities/Guest';
import { updateSubscriptionHouses } from './subscription';
import { geohash } from '../util/geolocation';
import { asyncForEach } from '../util/forEach';
import { getTimezone } from '../../google/timezone';
import { House } from '../entities/House';

export async function addPotentialSuperAdminPrivilege() {
  return functions.httpsCallable('givePotentialSuperAdminPrivilege');
}

export async function addAdminAuthorization(admin: Admin) {
  const result = await functions.httpsCallable('addAdminAuthorization')(admin);
  if (!result.data) {
    throw { message: 'Something went wrong.' };
  }
  return refreshClaims();
}

export async function addGuestAuthorization(guest: Guest) {
  const result = await functions.httpsCallable('addGuestAuthorization')(guest);
  if (!result.data) {
    throw { message: 'Something went wrong' };
  }
  return refreshClaims();
}

export async function sendAllInvites(
  houses: Houses,
  _operator: User,
  guest: boolean = true,
  admin: boolean = true,
  seniorPeer: boolean = true,
): Promise<CreateInvitationResult[]> {
  const calls: Promise<CreateInvitationResult>[] = [];
  each(houses, house => {
    const initialPhase = getInitialPhase(house);
    if (house.pendingAdminInvites && admin) {
      house.pendingAdminInvites.forEach(email => {
        calls.push(
          createInvitation({
            email,
            houseId: house.id,
            role: 'admin',
            initialPhase: initialPhase?.name,
          }),
        );
      });
    }
    if (house.pendingGuestInvites && guest) {
      house.pendingGuestInvites.forEach(email => {
        calls.push(
          createInvitation({
            email,
            houseId: house.id,
            role: 'guest',
            initialPhase: initialPhase?.name,
          }),
        );
      });
    }
    if (house.seniorPeerEmails && seniorPeer) {
      house.seniorPeerEmails.forEach(email => {
        calls.push(
          createInvitation({
            email,
            houseId: house.id,
            role: 'senior-peer',
            initialPhase: initialPhase?.name,
          }),
        );
      });
    }
  });
  return Promise.all(calls);
}

/**
 * Issue a single admin invitation. The server (createInvitation CF) generates
 * the token, writes the invitation doc, and sends the email. The caller's
 * uid is taken from the auth context — `inviterUserId` is no longer needed.
 */
export const createAdminInvite = (
  adminEmail: string,
  houseId: string,
): Promise<CreateInvitationResult> => {
  return createInvitation({
    email: adminEmail,
    houseId,
    role: 'admin',
  });
};

/**
 * Issue a single guest invitation. See createAdminInvite for caller-uid
 * notes. `ownerId` is also no longer needed — the CF derives ownership
 * from the house document.
 */
export const createGuestInvite = (
  guestEmail: string,
  houseId: string,
  initialPhaseName: string,
): Promise<CreateInvitationResult> => {
  return createInvitation({
    email: guestEmail,
    houseId,
    role: 'guest',
    initialPhase: initialPhaseName,
  });
};

export const uploadHousePhotos = async (
  houses: Houses,
): Promise<{ houseId: string; url: string }[]> => {
  const promises: Promise<{ houseId: string; url: string }>[] = [];
  each(houses, house => {
    if (house.imageUrl) {
      const photo = uploadHousePhoto(house.imageUrl, house);
      promises.push(photo);
    }
  });
  return Promise.all(promises);
};

export async function initializeHouses(
  houses: Houses,
  _operator: User,
  inApp: boolean = false,
) {
  const batch = firestore.batch();
  const operator = cloneDeep(_operator);
  // check for an admin account with the operator's email
  let operatorAdmin: Admin;
  let adminDoc;
  if (operator.adminId) {
    operatorAdmin = await getAdmin(operator.adminId);
    adminDoc = adminCollection.doc(operatorAdmin.id);
  } else {
    // create the admin account for the operator and map it to the house
    operatorAdmin = new Admin(
      operator.email.toLowerCase(),
      operator.firstName,
      operator.lastName,
      operator.uid,
    );
    adminDoc = adminCollection.doc();
    operatorAdmin.id = adminDoc.id;
    operator.adminId = operatorAdmin.id;
  }
  // if (!operatorAdmin.houseIds)
  operatorAdmin.houseIds.push(...map(houses, house => house.id));
  if (
    typeof operatorAdmin.superAdmin === 'boolean' ||
    !operatorAdmin.superAdmin
  ) {
    operatorAdmin.superAdmin = [];
  }
  operatorAdmin.superAdmin.push(...map(houses, house => house.id));
  // NOTE: addAdminAuthorization is intentionally deferred to AFTER batch.commit().
  // The CF (post-S2 hardening, regroup-functions commit bb31845) fetches
  // houses/{id} to verify ownership and rejects with not-found if the house
  // doc does not yet exist. Granting the claim before committing the batch
  // therefore fails every new-operator onboarding. See Task 11 review fix.
  batch.set(adminDoc, operatorAdmin);

  // create the house documents
  const houseIds: string[] = [];
  const newHouseDocs: any[] = [];
  await asyncForEach(houses, async (house: House) => {
    house.adminIds.push(operatorAdmin.id!);
    house.superAdminIds.push(operatorAdmin.id!);
    house.pendingAdminInvites!.push(
      ...Array.from(new Set(house.pendingAdminInvites)),
    );
    house.pendingGuestInvites!.push(
      ...Array.from(new Set(house.pendingGuestInvites)),
    );
    house.geohash = geohash(house.lat, house.lng);
    house.timezone = await getTimezone(house.lat, house.lng);
    house.ownerId = operator.id!;
    houseIds.push(house.id);
    if (!operator.housesOwned) {
      operator.housesOwned = [];
    }
    operator.housesOwned.push(house.id);
    newHouseDocs.push(houseCollection.doc(house.id));
  });

  try {
    const houseUrls = await uploadHousePhotos(houses);
    houseUrls.forEach(houseUrl => {
      houses[houseUrl.houseId].imageUrl = houseUrl.url;
      houses[houseUrl.houseId].avatar = houseUrl.url;
    });
  } catch (error) {
    logException(error);
  }

  newHouseDocs.forEach(doc => batch.set(doc, houses[doc.id]));

  operator.orgSetupCompleted = true;
  operator.isAdmin = true;
  operator.isSuperAdmin = true;

  let inviteError;

  try {
    await batch.commit();
    // Grant the admin claim only after the houses exist in Firestore. The
    // addAdminAuthorization CF verifies ownership against houses/{id} and
    // refreshes claims internally; getAuthUser then captures the fresh token.
    await addAdminAuthorization(operatorAdmin);
    const token = await getAuthUser(true);
    // Send the invites only after the houses are persisted. The createInvitation
    // CF (post-Task-10) fetches houses/{id} server-side and throws not-found if
    // missing. Calling sendAllInvites before batch.commit() therefore failed
    // every new-operator onboarding silently (the error was swallowed into
    // inviteError and the operator received no invitation emails).
    try {
      await sendAllInvites(houses, operator);
    } catch (error) {
      inviteError = error;
    }
    const user = await updateSubscriptionHouses({
      ownerUserId: operator.id!,
      houseIds: houseIds,
      amountToAdjust: houseIds.length,
      action: 'add',
    });
    return {
      houses,
      inviteError,
      admin: operatorAdmin,
      user: { ...operator, subscriptionMetadata: user.subscriptionMetadata },
      token,
    };
  } catch (error) {
    logException(error);
    throw new Error('Failed to create houses.');
  }
}
