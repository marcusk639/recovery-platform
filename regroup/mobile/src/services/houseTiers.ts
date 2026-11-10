import { functions } from '../../firebase-setup';

/**
 * The caller's own tier in each house they hold a staff claim for, from the
 * myHouseTiers callable. Managers and peer leaders hold the same admin claim
 * and house-roles is server-only, so the app cannot tell them apart otherwise.
 * Display only: the rules enforce access.
 */
export async function getMyHouseTiers(): Promise<Record<string, string>> {
  const result = await functions.httpsCallable('myHouseTiers')({});
  return (result.data as { tiers?: Record<string, string> })?.tiers ?? {};
}
