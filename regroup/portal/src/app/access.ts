// Who may use the portal, decided from the user doc and their role per house.
export interface AccessUser {
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isGuest?: boolean;
  orgSetupCompleted?: boolean;
  potentialSuperAdmin?: boolean;
}

export type Access = 'operator' | 'setup-incomplete' | 'resident' | 'none';
type Roles = Record<string, string>;

const isStaffRole = (role: string | undefined) => role === 'admin' || role === 'superAdmin';

export const operatorHouseIds = (roles: Roles): string[] =>
  Object.keys(roles).filter((houseId) => isStaffRole(roles[houseId]));

export const canAccessHouse = (roles: Roles, houseId: string): boolean => isStaffRole(roles[houseId]);

export function accessFor(user: AccessUser | null, roles: Roles): Access {
  if (!user) return 'none';
  const settingUp = (user.isSuperAdmin || user.potentialSuperAdmin) && !user.orgSetupCompleted;
  if (settingUp) return 'setup-incomplete';
  if (operatorHouseIds(roles).length > 0) return 'operator';
  return Object.values(roles).includes('guest') ? 'resident' : 'none';
}

const CREDENTIAL_ERRORS = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'];

export function signInErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && CREDENTIAL_ERRORS.includes(code)) return "That email or password isn't right.";
  if (code === 'auth/too-many-requests') return 'Too many sign-in attempts. Wait a minute and try again.';
  return 'Could not sign in. Check your connection and try again.';
}
