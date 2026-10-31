import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from "@react-native-firebase/firestore";
import { firestore } from "../../../firebase-setup";
import { logException } from "../../util/logging";
import { EESTransactionType } from "../../entities/oxford/EESTransaction";

const eesRecords = () => collection(firestore, "ees-records");

export interface EESRecord {
  guestId: string;
  amount: number;
  paid: boolean;
  paidAt?: string;
  weekStart: string;
  houseId: string;
  createdAt?: string;
  type?: EESTransactionType;
}

export function calculateEES(
  totalExpenses: number,
  residentCount: number
): number {
  if (residentCount === 0) {
    return 0;
  }
  return Math.round((totalExpenses / residentCount) * 100) / 100;
}

export async function getEESRecords(
  houseId: string,
  weekStart: string
): Promise<(EESRecord & { id: string })[]> {
  try {
    const snapshot = await getDocs(
      query(
        eesRecords(),
        where("houseId", "==", houseId),
        where("weekStart", "==", weekStart)
      )
    );

    return snapshot.docs.map(
      (record) => ({ ...record.data(), id: record.id } as EESRecord & { id: string })
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load EES records");
  }
}

export async function markEESPaid(recordId: string): Promise<void> {
  try {
    await updateDoc(doc(eesRecords(), recordId), {
      paid: true,
      paidAt: new Date().toISOString(),
    });
  } catch (error) {
    logException(error);
    throw new Error("Failed to mark EES record as paid");
  }
}

/**
 * Returns EES records for a house across the most recent `weekCount` ISO weeks.
 * Uses a single Firestore `in` query (max 10 weeks to stay well under the 30-value limit).
 */
export async function getEESRecordsForRecentWeeks(
  houseId: string,
  weekCount: number
): Promise<(EESRecord & { id: string })[]> {
  const count = Math.min(weekCount, 10);
  const weekStarts: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i * 7);
    // Monday of that week
    const dayOfWeek = d.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    d.setUTCDate(d.getUTCDate() - daysToMonday);
    weekStarts.push(d.toISOString().split("T")[0]);
  }
  const uniqueWeeks = [...new Set(weekStarts)];
  try {
    const snapshot = await getDocs(
      query(
        eesRecords(),
        where("houseId", "==", houseId),
        where("weekStart", "in", uniqueWeeks)
      )
    );
    return snapshot.docs.map(
      (record) => ({ ...record.data(), id: record.id } as EESRecord & { id: string })
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load recent EES records");
  }
}

export async function createEESRecords(
  houseId: string,
  weekStart: string,
  guestIds: string[],
  amountPerGuest: number
): Promise<void> {
  try {
    const batch = writeBatch(firestore);

    guestIds.forEach((guestId) => {
      const ref = doc(eesRecords());
      const record: EESRecord & { id: string } = {
        id: ref.id,
        guestId,
        houseId,
        weekStart,
        amount: amountPerGuest,
        paid: false,
        // Hardened 2026-07-05: OxfordDashboard's transaction reader orders by
        // createdAt and renders tx.type — records created here previously set
        // neither, so they were silently excluded from the dashboard's
        // "recent transactions" list (Firestore orderBy drops docs missing the
        // ordered field) and would have crashed the renderer if that were
        // fixed in isolation (tx.type.charAt(0) on undefined). Weekly EES
        // assessments are routine dues, hence type 'payment'.
        createdAt: new Date().toISOString(),
        type: "payment",
      };
      batch.set(ref, record);
    });

    await batch.commit();
  } catch (error) {
    logException(error);
    throw new Error("Failed to create EES records");
  }
}
