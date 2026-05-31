import { auth } from 'firebase-admin';
import UserClaims from '../entities/UserClaim';
import { Role } from '../entities/Roles';

/**
 * Reads and normalises custom claims from a Firebase Auth user record.
 * Returns a plain object typed as UserClaims so callers can spread or mutate it.
 */
function parseCurrentClaims(
  customClaims: Record<string, unknown> | undefined | null
): UserClaims {
  const raw: Record<string, unknown> = customClaims ?? {};
  return {
    admin: Array.isArray(raw.admin) ? (raw.admin as string[]) : [],
    guest: Array.isArray(raw.guest) ? (raw.guest as string[]) : [],
    superAdmin: Array.isArray(raw.superAdmin) ? (raw.superAdmin as string[]) : [],
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
  const currentRoleClaims: string[] = (current[role as keyof Pick<UserClaims, 'admin' | 'guest' | 'superAdmin'>] ?? []) as string[];
  const merged = new Set([...currentRoleClaims, ...houseIds]);
  return {
    ...current,
    [role]: Array.from(merged),
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
  // Filter out all houseIds that should be removed. This avoids the splice(-1, 1)
  // bug where a not-found index (-1) would incorrectly remove the last element,
  // and also avoids index-shifting issues when removing multiple entries at once.
  const currentRoleClaims: string[] = (current[role as keyof Pick<UserClaims, 'admin' | 'guest' | 'superAdmin'>] ?? []) as string[];
  const remaining = currentRoleClaims.filter((id) => !houseIds.includes(id));
  return {
    ...current,
    [role]: remaining,
    potentialSuperAdmin,
  };
};
