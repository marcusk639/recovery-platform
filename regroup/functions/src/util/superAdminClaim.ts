import { auth } from 'firebase-admin';
import { logger } from 'firebase-functions';

/**
 * Grants the unscoped `potentialSuperAdmin` custom claim to a user after a
 * successful operator subscription checkout (web signup path). This claim is
 * intentionally NOT house-scoped — no house exists yet at subscription time
 * (house creation is gated behind entitlement). The house-scoped `admin`/
 * `superAdmin` grant belongs to a future `createHouse` callable.
 *
 * MERGE, NEVER OVERWRITE: `setCustomUserClaims` replaces the entire claims
 * object, so existing claims are always read first and spread back in. This
 * is what stops a re-run from silently wiping an operator's existing
 * house-scoped `admin`/`superAdmin` claims.
 *
 * IDEMPOTENT BY DIRECT MERGE-AND-SET, NOT REUSE OF
 * `givePotentialSuperAdminPrivilege`: that callable (callable/auth.ts)
 * refuses whenever the user already holds ANY house claim, which would
 * incorrectly block a returning/retrying operator who already has admin
 * access to a house. This helper instead merges unconditionally and treats
 * an already-true `potentialSuperAdmin` claim as a successful no-op, so
 * retries and repeat funnel runs are always safe.
 *
 * NEVER THROWS: by the time this runs, the Stripe subscription already
 * exists and the operator is on trial. Throwing here would fail the calling
 * callable and report signup failure to a client who is, in fact, already
 * subscribed — worse than a missing claim, which is repairable. Failures are
 * retried once, then logged at ERROR with only the uid (no PII) for manual
 * repair, and this resolves to `false` so the caller can surface a
 * "finishing setup" state instead of a false failure.
 */
export const grantPotentialSuperAdminClaim = async (userId: string): Promise<boolean> => {
  const attempt = async (): Promise<boolean> => {
    const user = await auth().getUser(userId);
    const existingClaims = (user.customClaims ?? {}) as Record<string, unknown>;
    if (existingClaims.potentialSuperAdmin === true) {
      return true;
    }
    await auth().setCustomUserClaims(userId, {
      ...existingClaims,
      potentialSuperAdmin: true,
    });
    return true;
  };

  try {
    return await attempt();
  } catch (firstError) {
    logger.warn('grantPotentialSuperAdminClaim failed, retrying once', {
      userId,
      error: firstError instanceof Error ? firstError.message : String(firstError),
    });
    try {
      return await attempt();
    } catch (secondError) {
      logger.error(
        'grantPotentialSuperAdminClaim failed after retry — operator is ' +
          'subscribed but not claim-authorized; grant potentialSuperAdmin manually',
        {
          userId,
          error: secondError instanceof Error ? secondError.message : String(secondError),
        },
      );
      return false;
    }
  }
};
