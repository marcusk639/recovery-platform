import { functions } from "../../firebase-setup";
import { houseCollection } from "./house";
import { Houses } from "../types";
import { cloneDeep, each, pick } from "lodash";
import { User } from "../entities/User";
import { getInitialPhase } from "../util/house";
import { createInvitation, CreateInvitationResult } from "./invitations";
import Admin from "../entities/Admin";
import "@react-native-firebase/firestore";
import { uploadHousePhoto } from "./storage";
import { logException } from "../util/logging";
import { refreshClaims, getAuthUser } from "./users";
import { Guest } from "../entities/Guest";
import { createHouses, HouseCreatePayload } from "./subscription";
import { asyncForEach } from "../util/forEach";
import { getTimezone } from "../../google/timezone";
import { House } from "../entities/House";

// Whitelist mirrored from the server createHouseInputSchema. imageUrl/avatar
// are deliberately absent: they are local file URIs until uploaded.
const HOUSE_PAYLOAD_KEYS = [
  "id", "name", "lat", "lng", "street", "city", "state", "zip", "country",
  "timezone", "phoneNumber", "monthlyRent", "weeklyRent", "maximumCapacity",
  "depositsAndFees", "rentFrequency", "gender", "baths", "wifi",
  "managerSetupType", "houseType", "phases", "chores", "rooms",
  "pendingAdminInvites", "pendingGuestInvites", "seniorPeerEmails",
];

const toPayload = (house: House): HouseCreatePayload => {
  const payload: any = pick(house, HOUSE_PAYLOAD_KEYS);
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  ["pendingAdminInvites", "pendingGuestInvites", "seniorPeerEmails"].forEach(
    (k) => payload[k] && (payload[k] = Array.from(new Set(payload[k])))
  );
  return payload;
};

export async function addPotentialSuperAdminPrivilege() {
  return functions.httpsCallable("givePotentialSuperAdminPrivilege");
}

export async function addAdminAuthorization(admin: Admin) {
  const result = await functions.httpsCallable("addAdminAuthorization")(admin);
  if (!result.data) {
    throw { message: "Something went wrong." };
  }
  return refreshClaims();
}

export async function addGuestAuthorization(guest: Guest) {
  const result = await functions.httpsCallable("addGuestAuthorization")(guest);
  if (!result.data) {
    throw { message: "Something went wrong" };
  }
  return refreshClaims();
}

export async function sendAllInvites(
  houses: Houses,
  _operator: User,
  guest: boolean = true,
  admin: boolean = true,
  seniorPeer: boolean = true
): Promise<CreateInvitationResult[]> {
  const calls: Promise<CreateInvitationResult>[] = [];
  each(houses, (house) => {
    const initialPhase = getInitialPhase(house);
    if (house.pendingAdminInvites && admin) {
      house.pendingAdminInvites.forEach((email) => {
        calls.push(
          createInvitation({
            email,
            houseId: house.id,
            role: "admin",
            initialPhase: initialPhase?.name,
          })
        );
      });
    }
    if (house.pendingGuestInvites && guest) {
      house.pendingGuestInvites.forEach((email) => {
        calls.push(
          createInvitation({
            email,
            houseId: house.id,
            role: "guest",
            initialPhase: initialPhase?.name,
          })
        );
      });
    }
    if (house.seniorPeerEmails && seniorPeer) {
      house.seniorPeerEmails.forEach((email) => {
        calls.push(
          createInvitation({
            email,
            houseId: house.id,
            role: "senior-peer",
            initialPhase: initialPhase?.name,
          })
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
  houseId: string
): Promise<CreateInvitationResult> => {
  return createInvitation({
    email: adminEmail,
    houseId,
    role: "admin",
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
  initialPhaseName: string
): Promise<CreateInvitationResult> => {
  return createInvitation({
    email: guestEmail,
    houseId,
    role: "guest",
    initialPhase: initialPhaseName,
  });
};

export const uploadHousePhotos = async (
  houses: Houses
): Promise<{ houseId: string; url: string }[]> => {
  const promises: Promise<{ houseId: string; url: string }>[] = [];
  each(houses, (house) => {
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
  inApp: boolean = false
) {
  const operator = cloneDeep(_operator);

  await asyncForEach(houses, async (house: House) => {
    house.timezone = await getTimezone(house.lat, house.lng);
  });

  try {
    // The server creates the houses, admin doc, user fields and subscription
    // map in one transaction and grants admin/superAdmin claims.
    const { houseIds, admin, subscriptionMetadata } = await createHouses(
      Object.values(houses).map(toPayload)
    );
    const token = await getAuthUser(true);

    // Best-effort: setup is already complete without photos.
    try {
      const houseUrls = await uploadHousePhotos(houses);
      await Promise.all(
        houseUrls.map(({ houseId, url }) => {
          houses[houseId].imageUrl = url;
          houses[houseId].avatar = url;
          return houseCollection
            .doc(houseId)
            .update({ imageUrl: url, avatar: url });
        })
      );
    } catch (error) {
      logException(error);
    }

    let inviteError;
    try {
      await sendAllInvites(houses, operator);
    } catch (error) {
      inviteError = error;
    }

    return {
      houses,
      inviteError,
      admin,
      user: {
        ...operator,
        orgSetupCompleted: true,
        isAdmin: true,
        isSuperAdmin: true,
        adminId: admin.id,
        // A retry returns ids the operator already owns; keep the list unique.
        housesOwned: Array.from(new Set([...(operator.housesOwned ?? []), ...houseIds])),
        subscriptionMetadata,
      },
      token,
    };
  } catch (error) {
    logException(error);
    throw new Error("Failed to create houses.");
  }
}
