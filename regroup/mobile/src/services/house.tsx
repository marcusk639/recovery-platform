import { firestore, functions } from "../../firebase-setup";
import { logException } from "../util/logging";
import { House, AwaitingVerification } from "../entities/House";
import { Chores } from "../entities/Chore";
import { HOUSE_CODE_INVALID } from "../constants/errors";
import { Houses, Guests, Admins } from "../types";
import * as crud from "./crud";
import { HouseSearch } from "../entities/HouseSearch";
import Admin from "../entities/Admin";
import { adminCollection } from "./admin";
import each from "lodash/each";
import filter from "lodash/filter";
import isEqual from "lodash/isEqual";
import "@react-native-firebase/firestore";
import { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";
import FirebaseFirestore from "@react-native-firebase/firestore";
import { guestCollection, archiveCollection } from "./guest";
import { Guest } from "../entities/Guest";
import { uploadHousePhoto } from "./storage";
import { createAdminInvite, createGuestInvite } from "./setup-wizard";
import { CreateInvitationResult } from "./invitations";
import { getFirstPhase } from "../util/house";
import { houseIdsRemoved } from "../util/admin";
import { geohash, getGeohashRange } from "../util/geolocation";
import { getTimezone } from "../../google/timezone";
import { firebase } from "@react-native-firebase/firestore";
import { getCurrentTime } from "../util/display";
export const houseCollection = firestore.collection("houses");

export function shapeHouses(
  docs: FirebaseFirestoreTypes.QueryDocumentSnapshot[],
): { [id: string]: House } {
  const houses: { [id: string]: House } = {};
  docs.forEach((house) => (houses[house.id] = house.data() as House));
  return houses;
}

/**
 * Gets a house by id
 * @param {*} houseId
 */
export async function getHouse(houseId: string): Promise<House> {
  return crud.get<House>(houseCollection, houseId);
}

export async function createHouse(house: House) {
  return crud.create<House>(houseCollection, house);
}

/**
 * Gets houses where attribute == value
 * @param {*} attribute The attribute to select by
 * @param {*} value The value of the attribute
 */
export async function getHouses(
  attribute: string,
  operator: FirebaseFirestore.WhereFilterOp,
  value: string,
): Promise<Houses> {
  const result = await crud.getByAttribute<House>(
    houseCollection,
    attribute,
    operator,
    value,
  );
  const houses: { [id: string]: House } = {};
  result.forEach((house) => (houses[house.id] = house));
  return houses;
}

export async function updateHouseAdmins(houseId: string, adminId: string) {
  return houseCollection.doc(houseId).update({
    adminIds: firebase.firestore.FieldValue.arrayUnion(adminId),
    pendingAdminInvites: firebase.firestore.FieldValue.arrayRemove(),
  });
}

export async function getNearbyHouses(
  lat: number,
  lng: number,
  distanceInMiles: number,
) {
  const range = getGeohashRange(lat, lng, distanceInMiles);
  const result = await houseCollection
    .where("geohash", ">=", range.lower)
    .where("geohash", "<=", range.upper)
    .get();
  return shapeHouses(result.docs);
}

/**
 * Update house with values
 * @param {*} values
 * @param {*} attribute
 * @param {*} value
 */
export async function updateHouse(
  houseId: string,
  values: Partial<House>,
): Promise<void> {
  if (!values.id) {
    values.id = houseId;
  }

  // Clean chores to ensure no empty field names
  if (values.chores) {
    const cleanedChores: Chores = {};
    Object.keys(values.chores).forEach((key) => {
      const chore = values.chores![key];
      if (
        chore &&
        chore.name &&
        chore.name.trim() !== "" &&
        key.trim() !== ""
      ) {
        cleanedChores[chore.name] = chore;
      }
    });
    values.chores = cleanedChores;
  }

  return crud.update<Partial<House>>(houseCollection, values);
}

export async function updateHouseAwaitingVerification(
  houseCode: string,
  awaitingVerification: AwaitingVerification,
) {
  const houses = await crud.getByAttribute<House>(
    houseCollection,
    "code",
    "==",
    houseCode,
  );
  if (!houses.length) {
    throw new Error(HOUSE_CODE_INVALID);
  }
  const house = houses[0];
  if (!house.awaitingVerification) {
    house.awaitingVerification = [];
  }
  house.awaitingVerification.push(awaitingVerification);
  return updateHouse(house.id, house);
}

export async function searchForHouses(searchData: HouseSearch) {
  const houses = await getNearbyHouses(
    searchData.filters!.location.lat!,
    searchData.filters!.location.lng!,
    25,
  );
  // filter houses by gender
  if (searchData?.filters?.gender) {
    const filteredHouses = filter(houses, (house) => {
      return house.gender === searchData?.filters?.gender;
    });
    return filteredHouses;
  }
  return houses;
}

export async function createHouseBatch(house: House, _admins: Admin[]) {
  const batch = firestore.batch();
  const admins: Admin[] = [];
  _admins.forEach((admin) => {
    const newAdminDoc = adminCollection.doc();
    admins.push({ ...admin, id: newAdminDoc.id });
    batch.set(newAdminDoc, { ...admin, id: newAdminDoc.id });
  });
  const newHouseDoc = houseCollection.doc();
  const newHouse: House = {
    ...house,
    adminIds: admins.filter((a) => a.id).map((a) => a.id!),
    id: newHouseDoc.id,
    createdAt: getCurrentTime(),
  };
  newHouse.geohash =
    newHouse.lat && newHouse.lng
      ? geohash(newHouse.lat, newHouse.lng)
      : "unknown";
  newHouse.timezone = await getTimezone(newHouse.lat, newHouse.lng);
  batch.set(newHouseDoc, newHouse);
  try {
    await batch.commit();
    return { house: newHouse, admins };
  } catch (error) {
    logException(error);
    throw new Error("Failed to create house.");
  }
}

export function createHouseId(): string {
  return crud.createId(houseCollection);
}

export type HouseSettings =
  "chores" | "phases" | "managers" | "guests" | "house";

const getUpdates = (
  membersBefore: { [key: string]: Admin | Guest },
  membersAfter: { [key: string]: Admin | Guest },
  guest: boolean = false,
): (Admin | Guest)[][] => {
  const updatedMembers: (Admin | Guest)[] = [];
  const deletedMembers: (Admin | Guest)[] = [];
  const adminGuests: Guest[] = [];
  const demotedGuests: Guest[] = [];
  each(membersBefore, (memberBefore) => {
    const memberAfter = membersAfter[memberBefore.id!];
    if (memberAfter) {
      if (!isEqual(memberBefore, memberAfter)) {
        updatedMembers.push(memberAfter);
        if (
          guest &&
          !(memberBefore as Guest).isAdmin &&
          (memberAfter as Guest).isAdmin
        ) {
          adminGuests.push(memberAfter as Guest);
        }
        if (
          guest &&
          (memberBefore as Guest).isAdmin &&
          !(memberAfter as Guest).isAdmin
        ) {
          demotedGuests.push(memberAfter as Guest);
        }
      }
    } else {
      // member was deleted
      deletedMembers.push(memberBefore);
    }
  });
  return [updatedMembers, deletedMembers, adminGuests, demotedGuests];
};

/**
 * Use this to send invites for an already existing house
 * @param house
 * @param houseBefore
 */
const sendNewInvites = async (
  house: Partial<House>,
  houseBefore: House,
): Promise<CreateInvitationResult[]> => {
  const calls: Promise<CreateInvitationResult>[] = [];
  if (house.pendingAdminInvites && house.pendingAdminInvites.length) {
    house.pendingAdminInvites.forEach((updatedAdminEmail) => {
      if (
        !houseBefore.pendingAdminInvites ||
        !houseBefore.pendingAdminInvites.includes(updatedAdminEmail)
      ) {
        calls.push(createAdminInvite(updatedAdminEmail, house.id!));
      }
    });
  }
  if (house.pendingGuestInvites && house.pendingGuestInvites.length) {
    house.pendingGuestInvites.forEach((updatedGuestEmail) => {
      if (
        !houseBefore.pendingGuestInvites ||
        !houseBefore.pendingGuestInvites.includes(updatedGuestEmail)
      ) {
        const firstPhase = getFirstPhase(house.phases!);
        if (firstPhase) {
          calls.push(
            createGuestInvite(updatedGuestEmail, house.id!, firstPhase.name),
          );
        }
      }
    });
  }
  return Promise.all(calls);
};

export const promoteGuestsToAdmin = async (guests: Guest[]) => {
  if (guests && guests.length) {
    const response = await functions.httpsCallable("promoteGuestsToAdmin")(
      guests,
    );
    return response.data;
  }
};

export const removeAdminPrivilegesForGuests = async (adminGuests: Guest[]) => {
  if (adminGuests && adminGuests.length) {
    const response = await functions.httpsCallable("removePrivilegesForGuests")(
      { role: "admin", guests: adminGuests },
    );
    return response.data;
  }
};

/**
 * Revokes house-access custom claims for guests who no longer have a live
 * membership in the house (e.g. discharged residents). Without this call the
 * guest doc can be updated to a terminal status while the underlying Firebase
 * custom claims — which Firestore security rules gate house access on — keep
 * granting full house-level read/write access indefinitely.
 */
export const removeGuestPrivileges = async (guests: Guest[]) => {
  if (guests && guests.length) {
    const response = await functions.httpsCallable("removePrivilegesForGuests")(
      { role: "guest", guests },
    );
    return response.data;
  }
};

export const removeAdminPrivileges = async (
  admin: Admin,
  adminHouseIds: string[],
  superAdminHouseIds: string[],
) => {
  const response = await functions.httpsCallable("deleteAdminAuthorization")({
    admin,
    adminHouseIds,
    superAdminHouseIds,
  });
  return response.data;
};

export async function updateHouseBatch(
  house: Partial<House>,
  houseBefore: House,
  guestsBefore: Guests,
  guestsAfter: Guests,
  adminsBefore?: Admins,
  adminsAfter?: Admins,
  type?: HouseSettings,
) {
  const batch = firestore.batch();

  // Clean chores to ensure no empty field names
  if (house.chores) {
    const cleanedChores: Chores = {};
    Object.keys(house.chores).forEach((key) => {
      const chore = house.chores![key];
      if (
        chore &&
        chore.name &&
        chore.name.trim() !== "" &&
        key.trim() !== ""
      ) {
        cleanedChores[chore.name] = chore;
      }
    });
    house.chores = cleanedChores;
  }
  const [updatedGuests, deletedGuests, adminGuests, demotedGuests] = getUpdates(
    guestsBefore,
    guestsAfter,
    true,
  ) as Guest[][];
  const [updatedAdmins, deletedAdmins] = getUpdates(
    adminsBefore!,
    adminsAfter!,
    false,
  ) as Admin[][];
  // check image
  if (house.imageUrl !== houseBefore.imageUrl) {
    try {
      house.imageUrl = (await uploadHousePhoto(house.imageUrl!, house)).url;
    } catch (error) {
      // continue
    }
  }
  if (house.lat !== houseBefore.lat || house.lng !== houseBefore.lng) {
    house.geohash = geohash(house.lat!, house.lng!);
  }
  const promises = [];
  // create invite emails, if necessary
  promises.push(sendNewInvites(house, houseBefore));
  // promote guests to admin
  promises.push(promoteGuestsToAdmin(adminGuests));
  // remove admin privileges from guests
  promises.push(removeAdminPrivilegesForGuests(demotedGuests));
  // remove admin privileges for admins if necessary
  updatedAdmins.forEach((after) => {
    const before = adminsBefore![after.id!];
    const [removedSuperAdminHouses, removedAdminHouses] = houseIdsRemoved(
      before,
      after,
    );
    if (removedSuperAdminHouses.length || removedAdminHouses.length) {
      promises.push(
        removeAdminPrivileges(
          after,
          removedAdminHouses,
          removedSuperAdminHouses,
        ),
      );
    }
  });
  batch.update(houseCollection.doc(house.id), house);
  updatedGuests.forEach((guest) => {
    batch.update(guestCollection.doc(guest.id), guest);
  });
  updatedAdmins.forEach((admin) => {
    batch.update(adminCollection.doc(admin.id), admin);
  });
  deletedGuests.forEach((guest) => {
    batch.delete(guestCollection.doc(guest.id));
    batch.set(archiveCollection.doc(guest.id), guest);
  });
  deletedAdmins.forEach((admin) => {
    batch.delete(adminCollection.doc(admin.id));
  });
  promises.push(batch.commit());
  try {
    const result = await Promise.all(promises);
    return result;
  } catch (error) {
    logException(error);
    throw error;
  }
}

/**
 * Finalize house setup wizard
 * Marks the house as fully configured
 */
export async function finalizeHouseSetup(
  houseId: string,
  finalConfig: Partial<House>,
): Promise<void> {
  const updates = {
    ...finalConfig,
    setupComplete: true,
    updatedAt: getCurrentTime(),
  };
  await crud.update<House>(houseCollection, { id: houseId, ...updates });
}
