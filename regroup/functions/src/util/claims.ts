import { auth } from 'firebase-admin';
import UserClaims from '../entities/UserClaim';
import { Role } from '../entities/Roles';

/**
 * Reads and normalises custom claims from a Firebase Auth user record.
 * Returns a plain object typed as UserClaims so callers can spread or mutate it.
 */
function toHouseRoleClaim(raw: unknown): Record<string, true> {
  // Normalise to the map shape required by the Firestore rules. Tolerates the
  // legacy array shape so that any user whose claims are rewritten (on the next
  // add/remove authorization call) is transparently migrated map-ward.
  if (Array.isArray(raw)) {
    return raw.reduce<Record<string, true>>((acc, id) => {
      if (typeof id === 'string') acc[id] = true;
      return acc;
    }, {});
  }
  if (raw != null && typeof raw === 'object') {
    return Object.keys(raw as Record<string, unknown>).reduce<Record<string, true>>(
      (acc, id) => {
        acc[id] = true;
        return acc;
      },
      {}
    );
  }
  return {};
}

function parseCurrentClaims(
  customClaims: Record<string, unknown> | undefined | null
): UserClaims {
  const raw: Record<string, unknown> = customClaims ?? {};
  return {
    admin: toHouseRoleClaim(raw.admin),
    guest: toHouseRoleClaim(raw.guest),
    superAdmin: toHouseRoleClaim(raw.superAdmin),
    potentialSuperAdmin: typeof raw.potentialSuperAdmin === 'boolean'
      ? raw.potentialSuperAdmin
      : undefined,
  };
}

export const createClaims = async (
  userId: string,
  houseIds: string[],
  role: Role,
  potentialSuperAdmin: boolean = false
): Promise<UserClaims> => {
  const currentUser = await auth().getUser(userId);
  const current = parseCurrentClaims(currentUser?.customClaims);
  const currentRoleClaims =
    current[role as keyof Pick<UserClaims, 'admin' | 'guest' | 'superAdmin'>];
  const merged: Record<string, true> = { ...currentRoleClaims };
  for (const houseId of houseIds) {
    merged[houseId] = true;
  }
  return {
    ...current,
    [role]: merged,
    potentialSuperAdmin,
  };
};

export const deleteClaim = async (
  userId: string,
  houseIds: string[],
  role: Role,
  potentialSuperAdmin: boolean = false
): Promise<UserClaims> => {
  const currentUser = await auth().getUser(userId);
  const current = parseCurrentClaims(currentUser?.customClaims);
  // Remove each houseId key from the role map. Deleting absent keys is a no-op,
  // so this is safe whether or not the user currently holds the role in a house.
  const currentRoleClaims =
    current[role as keyof Pick<UserClaims, 'admin' | 'guest' | 'superAdmin'>];
  const remaining: Record<string, true> = { ...currentRoleClaims };
  for (const houseId of houseIds) {
    delete remaining[houseId];
  }
  return {
    ...current,
    [role]: remaining,
    potentialSuperAdmin,
  };
};

/**
 * Grants admin AND superAdmin on every given house in a single read-modify-write.
 * Building both roles from one snapshot and merging once avoids the stale-map bug
 * where two createClaims results from the same snapshot were spread together.
 */
export const grantHouseRoles = async (
  userId: string,
  houseIds: string[]
): Promise<void> => {
  const currentUser = await auth().getUser(userId);
  const { potentialSuperAdmin, ...current } = parseCurrentClaims(
    currentUser?.customClaims
  );
  const admin: Record<string, true> = { ...current.admin };
  const superAdmin: Record<string, true> = { ...current.superAdmin };
  for (const houseId of houseIds) {
    admin[houseId] = true;
    superAdmin[houseId] = true;
  }
  await auth().setCustomUserClaims(userId, {
    ...current,
    admin,
    superAdmin,
    ...(potentialSuperAdmin !== undefined ? { potentialSuperAdmin } : {}),
  });
};
