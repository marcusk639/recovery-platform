import { httpsCallable } from "@react-native-firebase/functions";
import { functions } from "../../firebase-setup";
import { Houses } from "../types";
import { cloneDeep, each, pick } from "lodash";
import { User } from "../entities/User";
import { createInvitation, CreateInvitationResult } from "./invitations";
import { allInvitesFailed, InviteFailure, sendAllInvites } from "./setup-wizard-invites";
import Admin from "../entities/Admin";
import { uploadHousePhoto } from "./storage";
import { logException } from "../util/logging";
import { refreshClaims, getAuthUser } from "./users";
import { Guest } from "../entities/Guest";
import { createHouses, HouseCreatePayload } from "./subscription";
import { applyHousePhotos } from "./setup-wizard-photos";
import { housesCreatedError, toCreateHousesError } from "./setup-wizard-errors";
import { asyncForEach } from "../util/forEach";
import { getTimezone } from "../../google/timezone";
import { House } from "../entities/House";

// Whitelist mirrored from the server createHouseInputSchema (every schema key
// except `requestKey`, which toPayload adds). imageUrl/avatar are deliberately
// absent: they are local file URIs until uploaded. `id` is absent too: the
// server derives house ids, and the local wizard id is sent only as the
// idempotency `requestKey`. Keep this a plain string-literal array: the
// functions suite parses it from this file to check it against the schema
// (regroup/functions/src/__tests__/houses/mobilePayloadKeys.drift.test.ts).
export const HOUSE_PAYLOAD_KEYS = [
  "name", "lat", "lng", "street", "city", "state", "zip", "country",
  "timezone", "phoneNumber", "monthlyRent", "weeklyRent", "maximumCapacity",
  "depositsAndFees", "rentFrequency", "gender", "baths", "wifi", "certified",
  "managerSetupType", "houseType", "phases", "chores", "rooms",
  "pendingAdminInvites", "pendingGuestInvites", "seniorPeerEmails",
];

const toPayload = (house: House): HouseCreatePayload => {
  const payload: any = { ...pick(house, HOUSE_PAYLOAD_KEYS), requestKey: house.id };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  ["pendingAdminInvites", "pendingGuestInvites", "seniorPeerEmails"].forEach(
    (k) => payload[k] && (payload[k] = Array.from(new Set(payload[k])))
  );
  return payload;
};

export async function addPotentialSuperAdminPrivilege() {
  return httpsCallable(functions, "givePotentialSuperAdminPrivilege");
}

export async function addAdminAuthorization(admin: Admin) {
  const result = await httpsCallable(functions, "addAdminAuthorization")(admin);
  if (!result.data) {
    throw { message: "Something went wrong." };
  }
  return refreshClaims();
}

export async function addGuestAuthorization(guest: Guest) {
  const result = await httpsCallable(functions, "addGuestAuthorization")(guest);
  if (!result.data) {
    throw { message: "Something went wrong" };
  }
  return refreshClaims();
}

export { sendAllInvites } from "./setup-wizard-invites";
export type { InviteFailure, SendInvitesResult } from "./setup-wizard-invites";

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

// Unused by the wizard (photos go through setup-wizard-photos.ts).
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

/**
 * Re-key the wizard's houses by the server-derived ids returned in idMap
 * (local wizard id → server id), so everything after createHouses — photo
 * upload paths, house updates, invitations, the returned houses — uses the
 * ids the houses actually have in Firestore.
 */
const toServerHouses = (houses: Houses, idMap: Record<string, string>): Houses => {
  const out: Houses = {};
  Object.values(houses).forEach((house) => {
    const id = idMap?.[house.id];
    if (!id) {
      throw new Error("createHouses returned no id for a requested house");
    }
    out[id] = { ...house, id };
  });
  return out;
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

  // (a) The server creates the houses, admin doc, user fields and subscription
  // map in one transaction, grants admin/superAdmin claims, then sets the
  // onboarding flags (orgSetupCompleted/isAdmin/isSuperAdmin). It derives the
  // house ids; idMap translates our local wizard ids to them.
  let created: Awaited<ReturnType<typeof createHouses>>;
  try {
    created = await createHouses(Object.values(houses).map(toPayload));
  } catch (error) {
    logException(error, "initializeHouses: createHouses failed");
    throw toCreateHousesError(error);
  }
  const { houseIds, idMap, admin, subscriptionMetadata } = created;

  // (b) The houses now exist server-side: nothing below may report that they
  // were not created.
  let serverHouses: Houses;
  let token;
  try {
    serverHouses = toServerHouses(houses, idMap);
    token = await getAuthUser(true);
  } catch (error) {
    logException(
      error,
      `initializeHouses: post-create step failed houses=${houseIds.join(",")}`
    );
    throw housesCreatedError(error);
  }

  // Best-effort: setup is already complete without photos.
  const photoFailures = await applyHousePhotos(serverHouses);

  const serverIds = Object.keys(serverHouses).join(",");
  let inviteError;
  let failures: InviteFailure[] = [];
  try {
    const sent = await sendAllInvites(serverHouses, operator);
    failures = sent.failures;
    if (sent.failed > 0) {
      logException(
        new Error("initializeHouses: invitations failed"),
        `houses=${serverIds} sent=${sent.sent} failed=${sent.failed}`
      );
    }
  } catch (error) {
    inviteError = error;
    failures = allInvitesFailed(serverHouses);
    // Not the raw error: its message may quote an email address.
    logException(
      new Error("initializeHouses: invitations threw"),
      `houses=${serverIds} count=${failures.length} name=${(error as Error)?.name}`
    );
  }
  // House names are for the on-device notice only; never log them.
  const failedInvites = failures.map((f) => ({
    ...f,
    houseName: serverHouses[f.houseId]?.name ?? "",
  }));

  return {
    houses: serverHouses,
    inviteError,
    inviteFailures: failures.length,
    failedInvites,
    photoFailures,
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
}
