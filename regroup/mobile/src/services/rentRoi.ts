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
 * Rent-collection ROI for a house (#32). Dates are YYYY-MM-DD; leave them out
 * for all time. The server gates it by the plan's `analytics` capability and
 * refuses anyone but the house's owner.
 */
export async function getRentRoiMetrics(
  houseId: string,
  startDate?: string,
  endDate?: string,
): Promise<RentRoiResult> {
  const result = await httpsCallable(
    functions,
    'rentRoiMetrics',
  )({
    houseId,
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  });
  return result.data as RentRoiResult;
}
