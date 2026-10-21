// Recovery for operators whose houses were created but whose setup never
// finished (the claim grant or onboarding-flags write failed and the app
// restarted before a retry). Without this, login routes them to an empty setup
// wizard, where re-entering a house mints a new id and hits the plan's
// property cap. It also repairs claims for a completed operator whose later
// add-house claim grant failed. See the finishOperatorSetup callable in
// regroup/functions.
import * as Sentry from '@sentry/react-native';
import { functions } from '../../firebase-setup';
import { User } from '../entities/User';
import { logException } from '../util/logging';

export type FinishOperatorSetupResult =
  | { completed: false }
  | { completed: true; houseIds: string[] };

/**
 * - not-needed: needsSetupRecovery is false (the server was not called), or a
 *               completed operator's claims repair granted nothing, so there
 *               is no new claim to refresh the token for.
 * - completed:  the server finished setup or granted missing claims.
 * - incomplete: the server found no house this uid owns; the wizard is right.
 * - failed:     the callable threw. For an incomplete setup the operator must
 *               not reach the wizard; for a completed operator it is logged.
 */
export type SetupRecoveryOutcome = 'not-needed' | 'completed' | 'incomplete' | 'failed';

/** Mirrors OPERATOR_SETUP_FIELDS in functions/src/houses/operatorSetup.ts. */
export const OPERATOR_SETUP_FIELDS = {
  orgSetupCompleted: true,
  isAdmin: true,
  isSuperAdmin: true,
} as const;

/** The house-role claims read from the caller's ID token. */
export interface HouseRoleClaims {
  admin?: unknown;
  superAdmin?: unknown;
}

const hasHouseClaim = (claim: unknown, houseId: string): boolean =>
  typeof claim === 'object' &&
  claim !== null &&
  (claim as Record<string, unknown>)[houseId] === true;

/**
 * A house in the subscription map lacks admin or superAdmin in the token:
 * a house added after setup was created but its claim grant failed. The map
 * (server-written; deleted houses leave it) is used rather than housesOwned so
 * a stale client-side list cannot trigger the call. That limits repeat calls
 * but does not remove them: a map house the server will not grant (ownerId
 * rewritten, or past its candidate cap) still asks on each login, without a
 * token refresh (see finishOperatorSetup's repairOnly).
 */
export const hasUngrantedHouses = (user: Partial<User>, claims: HouseRoleClaims): boolean =>
  Object.keys(user.subscriptionMetadata?.houses ?? {}).some(
    (id) => !hasHouseClaim(claims.admin, id) || !hasHouseClaim(claims.superAdmin, id),
  );

/**
 * Not anonymous, and either setup is incomplete with houses listed in
 * housesOwned or the subscription houses map, or setup is complete and the
 * token is missing roles on a house in the map. Without claims a completed
 * operator is not checked.
 */
export const needsSetupRecovery = (
  user: Partial<User> | null | undefined,
  claims?: HouseRoleClaims,
): boolean => {
  if (!user || user.isAnonymous) {
    return false;
  }
  if (user.orgSetupCompleted) {
    return claims !== undefined && hasUngrantedHouses(user, claims);
  }
  const owned = user.housesOwned?.length ?? 0;
  const inPlan = Object.keys(user.subscriptionMetadata?.houses ?? {}).length;
  return owned > 0 || inPlan > 0;
};

/**
 * Asks the server to finish setup for the houses the caller owns, or, with
 * `repairOnly` (a completed operator), to grant missing house claims. Never
 * throws. On `completed` the caller must refresh the ID token and reload the
 * user (see loadRecoveredUser). A repair that granted nothing is `not-needed`;
 * without repairOnly an empty grant still counts as completed, because the
 * client's user doc may lag a server that already finished setup.
 */
export const finishOperatorSetup = async (
  uid: string | undefined,
  { repairOnly = false }: { repairOnly?: boolean } = {},
): Promise<SetupRecoveryOutcome> => {
  try {
    const result = await functions.httpsCallable('finishOperatorSetup')();
    const data = result?.data as FinishOperatorSetupResult | undefined;
    if (data?.completed === true) {
      return repairOnly && !data.houseIds?.length ? 'not-needed' : 'completed';
    }
    // uid and a reason tag only: no names, emails or house details.
    Sentry.captureMessage('finishOperatorSetup: server found no owned houses', {
      level: 'warning',
      tags: { reason: 'setup-recovery-incomplete' },
      extra: { uid },
    });
    return 'incomplete';
  } catch (error) {
    logException(error, 'finishOperatorSetup failed');
    return 'failed';
  }
};

/** finishOperatorSetup, but only for a user who needsSetupRecovery. */
export const finishOperatorSetupIfNeeded = async (
  user: Partial<User> | null | undefined,
  claims?: HouseRoleClaims,
): Promise<SetupRecoveryOutcome> =>
  needsSetupRecovery(user, claims)
    ? finishOperatorSetup(user?.id ?? user?.uid, { repairOnly: user?.orgSetupCompleted === true })
    : 'not-needed';

export interface RecoveredUserLoaders {
  /** Force-refreshes the ID token so the new house claims are present. */
  refreshToken: () => Promise<unknown>;
  reloadUser: () => Promise<User | undefined>;
}

/**
 * After a completed recovery: refresh the token, then reload the user. Neither
 * may fail the login. A refresh failure is logged and ignored. If the reload
 * throws or still shows setup incomplete (replica lag), the first read is
 * returned with the flags the server just set, so the operator is not sent
 * back into the wizard.
 */
export const loadRecoveredUser = async (
  firstRead: User,
  { refreshToken, reloadUser }: RecoveredUserLoaders,
): Promise<User> => {
  try {
    await refreshToken();
  } catch (error) {
    logException(error, 'operator setup recovery: token refresh failed');
  }
  try {
    const reloaded = await reloadUser();
    if (reloaded?.orgSetupCompleted === true) {
      return reloaded;
    }
  } catch (error) {
    logException(error, 'operator setup recovery: user reload failed');
  }
  return { ...firstRead, ...OPERATOR_SETUP_FIELDS };
};
