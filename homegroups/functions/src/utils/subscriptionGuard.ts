import { HttpsError } from "firebase-functions/v1/https";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function assertGroupActive(groupData: Record<string, unknown>): void {
  const status = groupData.subscriptionStatus as string | undefined;
  if (!status || !ACTIVE_STATUSES.has(status)) {
    throw new HttpsError(
      "failed-precondition",
      "This group's subscription is not active. Please renew to continue.",
    );
  }
}
