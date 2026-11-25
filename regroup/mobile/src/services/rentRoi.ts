import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../../firebase-setup';

/** rentRoiMetrics (functions/src/callable/analytics.ts) for an entitled house. All amounts are cents. */
export interface RentRoiMetrics {
  available: true;
  collectedNetCents: number;
  outstandingCents: number;
  onTimeRatePct: number | null;
  paymentCount: number;
  automatedCollectionCount: number;
  minutesSavedPerCollection: number;
  hoursSavedEstimate: number;
  caveats: string[];
}

/** What the callable returns when the house's plan doesn't include analytics. */
export interface RentRoiUpgradeRequired {
  available: false;
  status: 'upgrade_required';
  message: string;
}

export type RentRoiResult = RentRoiMetrics | RentRoiUpgradeRequired;

/**
 * Rent-collection ROI for a house (#32). `startAt` is the period's start as an
 * ISO instant (so it follows the caller's local day boundaries, not UTC dates);
 * leave it out for all time. The server gates it by the plan's `analytics`
 * capability and refuses anyone but the house's owner.
 */
export async function getRentRoiMetrics(
  houseId: string,
  startAt?: string,
): Promise<RentRoiResult> {
  const result = await httpsCallable(
    functions,
    'rentRoiMetrics',
  )({
    houseId,
    ...(startAt ? { startAt } : {}),
  });
  return result.data as RentRoiResult;
}
