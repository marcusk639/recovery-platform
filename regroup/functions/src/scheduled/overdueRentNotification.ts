import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { guestCollection } from "../api/firestore";
import { sendFcmToHouseAdmins } from "../util/notifications";

const OVERDUE_DAYS_THRESHOLD = 3;

interface OverdueGuestFields {
  houseId: string;
  firstName: string;
  lastName: string;
  balance: number;
}

/**
 * Exported for unit testing. Queries guests with positive balance and
 * rentDueDate more than OVERDUE_DAYS_THRESHOLD days ago, then notifies
 * each house's admins.
 */
export async function runOverdueRentCheck(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - OVERDUE_DAYS_THRESHOLD);
  const cutoffISO = cutoff.toISOString().split("T")[0]; // YYYY-MM-DD

  // Firestore disallows range inequality filters on two different fields in
  // a single query, so filter by balance server-side and apply the date
  // threshold client-side.
  const overdueSnapshot = await guestCollection.where("balance", ">", 0).get();

  const overdueDocs = overdueSnapshot.docs.filter((doc) => {
    const data = doc.data() as { rentDueDate?: string };
    // If the field doesn't exist, skip (not yet overdue by date)
    if (!data.rentDueDate) return false;
    return data.rentDueDate <= cutoffISO;
  });

  if (overdueDocs.length === 0) {
    logger.info("overdueRentCheck: no overdue guests");
    return;
  }

  // Group overdue guests by houseId
  const byHouse: Record<string, { name: string; balance: number }[]> = {};
  overdueDocs.forEach((doc) => {
    const data = doc.data() as OverdueGuestFields;
    if (!byHouse[data.houseId]) byHouse[data.houseId] = [];
    byHouse[data.houseId].push({
      name: `${data.firstName} ${data.lastName}`,
      balance: data.balance,
    });
  });

  // Notify each house
  const notifyPromises = Object.entries(byHouse).map(([houseId, guests]) => {
    const count = guests.length;
    const body =
      count === 1
        ? `${guests[0].name} has rent overdue ($${guests[0].balance.toFixed(
            2
          )})`
        : `${count} residents have overdue rent`;
    return sendFcmToHouseAdmins(houseId, "Rent Overdue", body);
  });

  await Promise.allSettled(notifyPromises);
  logger.info("overdueRentCheck: notified houses", {
    houseCount: Object.keys(byHouse).length,
    guestCount: overdueDocs.length,
  });
}

export const overdueRentNotification = onSchedule(
  { schedule: "0 9 * * *", timeZone: "UTC" },
  async (_event) => {
    logger.info("overdueRentNotification: starting daily check");
    await runOverdueRentCheck();
  }
);
