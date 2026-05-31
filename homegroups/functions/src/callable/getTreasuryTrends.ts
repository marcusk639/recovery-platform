import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { assertGroupActive } from "../utils/subscriptionGuard";

interface GetTreasuryTrendsData {
  groupId: string;
  granularity: "monthly" | "quarterly";
  periods: number;
}

interface PeriodTreasuryData {
  label: string;
  income: number;
  expenses: number;
  net: number;
  runningBalance?: number;
}

interface CategoryTotal {
  category: string;
  total: number;
  percentage: number;
  type: "income" | "expense";
}

interface GetTreasuryTrendsResult {
  groupId: string;
  granularity: "monthly" | "quarterly";
  periods: number;
  trend: PeriodTreasuryData[];
  expenseCategories: CategoryTotal[];
  incomeCategories: CategoryTotal[];
  currentBalance: number;
  totalIncomeAllPeriods: number;
  totalExpensesAllPeriods: number;
  computedAt: string;
}

interface PeriodBucket {
  start: Date;
  end: Date;
  label: string;
}

function generateMonthlyBuckets(numPeriods: number): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];
  const now = new Date();
  for (let i = numPeriods - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const label = `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
    buckets.push({ start, end, label });
  }
  return buckets;
}

function generateQuarterlyBuckets(numPeriods: number): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);

  for (let i = numPeriods - 1; i >= 0; i--) {
    let q = currentQuarter - i;
    let year = now.getFullYear();
    while (q < 0) {
      q += 4;
      year -= 1;
    }
    const startMonth = q * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 1);
    const label = `Q${q + 1} ${year}`;
    buckets.push({ start, end, label });
  }
  return buckets;
}

export const getTreasuryTrends = onCall(
  async (request: CallableRequest<GetTreasuryTrendsData>) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const { groupId, granularity, periods } = request.data;
    if (!groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }
    if (!granularity || !["monthly", "quarterly"].includes(granularity)) {
      throw new HttpsError(
        "invalid-argument",
        "granularity must be 'monthly' or 'quarterly'.",
      );
    }
    if (!periods || periods < 1 || periods > 24) {
      throw new HttpsError(
        "invalid-argument",
        "periods must be between 1 and 24.",
      );
    }

    // Verify admin
    const groupSnap = await db.collection("groups").doc(groupId).get();
    if (!groupSnap.exists) {
      throw new HttpsError("not-found", "Group not found.");
    }
    const groupData = groupSnap.data()!;
    const admins: string[] = groupData.admins || [];
    if (!admins.includes(userId)) {
      throw new HttpsError(
        "permission-denied",
        "Only group admins can view treasury trends.",
      );
    }
    assertGroupActive(groupData);

    try {
      const buckets =
        granularity === "monthly"
          ? generateMonthlyBuckets(periods)
          : generateQuarterlyBuckets(periods);

      const rangeStart = buckets[0].start;
      const rangeEnd = buckets[buckets.length - 1].end;

      // ---- Fetch current balance ----
      let currentBalance = 0;
      try {
        const treasurySnap = await db
          .collection("treasury_overviews")
          .where("groupId", "==", groupId)
          .limit(1)
          .get();
        if (!treasurySnap.empty) {
          currentBalance = treasurySnap.docs[0].data().balance || 0;
        }
      } catch {
        // Fallback: try group treasury subcollection
        try {
          const treasurySnap = await db
            .collection("groups")
            .doc(groupId)
            .collection("treasury")
            .limit(1)
            .get();
          if (!treasurySnap.empty) {
            currentBalance = treasurySnap.docs[0].data().balance || 0;
          }
        } catch {
          currentBalance = 0;
        }
      }

      // ---- Single full-range query, then partition in memory ----
      const allTxSnap = await db
        .collection("transactions")
        .where("groupId", "==", groupId)
        .where("createdAt", ">=", rangeStart)
        .where("createdAt", "<", rangeEnd)
        .get();

      // Initialise per-bucket accumulators
      const bucketIncome: number[] = buckets.map(() => 0);
      const bucketExpenses: number[] = buckets.map(() => 0);

      const expenseCategoryTotals: Record<string, number> = {};
      const incomeCategoryTotals: Record<string, number> = {};
      let totalIncome = 0;
      let totalExpenses = 0;

      allTxSnap.forEach((doc) => {
        const data = doc.data();
        const amount = data.amount || 0;
        const category = data.category || "Other";

        // Resolve the transaction date
        const createdAtRaw = data.createdAt;
        const txDate: Date = createdAtRaw?.toDate
          ? createdAtRaw.toDate()
          : new Date(createdAtRaw);

        // Assign to the correct bucket
        for (let i = 0; i < buckets.length; i++) {
          if (txDate >= buckets[i].start && txDate < buckets[i].end) {
            if (data.type === "income") {
              bucketIncome[i] += amount;
            } else if (data.type === "expense") {
              bucketExpenses[i] += amount;
            }
            break;
          }
        }

        // Category totals (full range)
        if (data.type === "expense") {
          expenseCategoryTotals[category] =
            (expenseCategoryTotals[category] || 0) + amount;
          totalExpenses += amount;
        } else if (data.type === "income") {
          incomeCategoryTotals[category] =
            (incomeCategoryTotals[category] || 0) + amount;
          totalIncome += amount;
        }
      });

      // Build trend from in-memory partition
      const trend: PeriodTreasuryData[] = buckets.map((bucket, i) => ({
        label: bucket.label,
        income: bucketIncome[i],
        expenses: bucketExpenses[i],
        net: bucketIncome[i] - bucketExpenses[i],
      }));

      // ---- Compute running balance (work backwards from current) ----
      let runningBal = currentBalance;
      for (let i = trend.length - 1; i >= 0; i--) {
        trend[i].runningBalance = runningBal;
        runningBal -= trend[i].net;
      }

      const expenseCategories: CategoryTotal[] = Object.entries(
        expenseCategoryTotals,
      )
        .map(([category, total]) => ({
          category,
          total,
          percentage:
            totalExpenses > 0 ? Math.round((total / totalExpenses) * 100) : 0,
          type: "expense" as const,
        }))
        .sort((a, b) => b.total - a.total);

      const incomeCategories: CategoryTotal[] = Object.entries(
        incomeCategoryTotals,
      )
        .map(([category, total]) => ({
          category,
          total,
          percentage:
            totalIncome > 0 ? Math.round((total / totalIncome) * 100) : 0,
          type: "income" as const,
        }))
        .sort((a, b) => b.total - a.total);

      const result: GetTreasuryTrendsResult = {
        groupId,
        granularity,
        periods,
        trend,
        expenseCategories,
        incomeCategories,
        currentBalance,
        totalIncomeAllPeriods: totalIncome,
        totalExpensesAllPeriods: totalExpenses,
        computedAt: new Date().toISOString(),
      };

      return result;
    } catch (error: any) {
      logger.error(
        `Error computing treasury trends for group ${groupId}:`,
        error,
      );
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to compute treasury trends.");
    }
  },
);
