---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-22-v4-analytics-insights.md
---

# V4.3: Analytics & Insights Implementation Plan

**Goal:** Give admins and members meaningful data about their recovery community — attendance trends, treasury health, member engagement, and personal sobriety progress — surfaced through charts and summary screens that turn raw Firestore data into actionable insights.

**Theme: "See Your Group's Progress"**

Recovery groups operate largely on intuition and anecdote. An admin knows roughly how many people attend but has never seen whether attendance is trending up or down. A treasurer knows the current balance but not whether expenses have grown faster than 7th tradition income over the past year. A member wants to see their own recovery journey in one place but currently has to cross-reference SobrietyTrackerScreen, GratitudeJournalScreen, and CheckInStreakScreen manually. This version unifies all of that into coherent analytics.

**What already exists (do not re-implement):**
- `getGroupDashboardMetrics` CF: computes per-period counts (members, attendance, treasury, messages). Returns single-period aggregate — *no time series*. Admin dashboard (`AdminDashboardScreen`) already renders these numbers without charts.
- `GroupDashboardMetrics` / `DashboardState` types in `mobile/src/types/domain/dashboard.ts`.
- `dashboardSlice.ts` with `fetchDashboardMetrics` thunk and selectors.
- `transactions` top-level collection with `groupId`, `type` (income/expense), `amount`, `category`, `createdAt` fields — fully queryable.
- `meetingInstances` top-level collection with `groupId`, `scheduledAt`, `attendeeCount`, `isCancelled` fields.
- `group_members` top-level collection (queried by `groupId`) with `joinedAt` on each doc.
- `UserDocument` has `sobrietyStartDate`, `checkInStreak`, `activityLog.lastMeetingAttendance`.
- `GratitudeEntryDocument` at `users/{userId}/gratitudeEntries/{YYYY-MM-DD}` — queryable.
- `StepProgressDocument` at `users/{userId}/stepProgress/current`.
- Profile screens: `SobrietyTrackerScreen`, `GratitudeJournalScreen`, `CheckInStreakScreen`, `StepTrackerScreen` — all exist independently.

**No charting library is currently installed.** The plan uses `victory-native` (see § New npm Packages). This is the best-supported charting library for React Native with no SVG native dep conflicts; it bundles its own SVG renderer via `react-native-svg` (check if already installed before adding).

**Architecture pattern for all new Cloud Functions:**
```typescript
// Follows getReferralStats.ts / getGroupDashboardMetrics.ts exactly:
import * as functions from "firebase-functions";
import { HttpsError } from "firebase-functions/v1/https";
import { CallableRequest } from "firebase-functions/v2/https";
import { db } from "../utils/firebase";

export const myNewCF = functions.https.onCall(
  async (request: CallableRequest<MyInputType>) => {
    const userId = request.auth?.uid;
    if (!userId) throw new HttpsError("unauthenticated", "...");
    // ... logic
    return { /* typed output */ };
  }
);
```

**Estimated Effort:** ~13-16 hrs

---

## Section Overview

| Section | Features | Effort | Dependencies |
|---------|----------|--------|--------------|
| V4.3.1 | Group Health Dashboard | 3-4 hrs | New CF for time-series data; victory-native |
| V4.3.2 | Attendance Analytics | 2-3 hrs | Extends meetingInstances queries; new CF |
| V4.3.3 | Treasury Trend Reports & CSV Export | 3-4 hrs | Extends transactions queries; new CF; RNHTMLtoPDF for export |
| V4.3.4 | Member Engagement Metrics | 2-3 hrs | Extends getGroupDashboardMetrics; admin-only aggregates |
| V4.3.5 | Personal Sobriety Insights ("My Recovery Journey") | 2-3 hrs | Client-side only; no new CF; aggregates existing profile data |

---

## New npm Packages

Before starting any task, check `mobile/package.json`:

```bash
# Check if react-native-svg is installed (victory-native requires it)
grep "react-native-svg" mobile/package.json

# Install if missing:
yarn add victory-native react-native-svg
# Then for iOS: cd mobile/ios && pod install
```

`victory-native` provides: `VictoryLine`, `VictoryBar`, `VictoryPie`, `VictoryChart`, `VictoryAxis`, `VictoryArea`. All charts in this plan use only these components.

No other new packages are needed. `react-native-html-to-pdf` (already installed) handles CSV export via a temporary file + `Share.share` from React Native core.

---

## V4.3.1: Group Health Dashboard

**Why first:** This is the highest-visibility feature — a single screen that gives the admin a "pulse" of their group. It also establishes the pattern (CF returns time-series arrays → Redux slice → chart component) that all subsequent sections follow.

**The key gap vs. existing AdminDashboard:** `getGroupDashboardMetrics` returns single-period aggregates. The Group Health Dashboard needs *multi-period time-series arrays* (e.g., attendance per month for the last 6 months) to draw trend charts. A new CF is needed.

---

### Task 1.1: `getGroupHealthTimeSeries` Cloud Function

**File:** `functions/src/callable/getGroupHealthTimeSeries.ts`

**Purpose:** Returns 6 months of month-by-month data for all four dashboard charts in a single call. Scoped to admins only.

**Input/output types:**
```typescript
interface GetGroupHealthTimeSeriesData {
  groupId: string;
  months: 3 | 6 | 12; // How many months back to compute
}

interface MonthlyDataPoint {
  month: string;       // "YYYY-MM" label for chart X-axis
  value: number;       // The metric value
}

interface GetGroupHealthTimeSeriesResult {
  groupId: string;
  months: number;
  // Retention: active members vs inactive (no meetingInstance check-in in 90 days)
  retention: {
    activeCount: number;
    inactiveCount: number;
    totalMembers: number;
    // "inactive" = member in group_members with no attendeeCount contribution in past 90 days
    // Computed once (current snapshot, not per-month) — annotation on the donut chart
  };
  // Attendance: avg attendees per meeting, per month
  attendanceTrend: MonthlyDataPoint[];
  // Treasury: monthly totals for income and expenses
  treasuryTrend: {
    month: string;
    income: number;
    expenses: number;
  }[];
  // Engagement: % of members who sent a chat message in that month
  engagementTrend: MonthlyDataPoint[];
  computedAt: string; // ISO
}
```

**Implementation logic:**
```typescript
// Auth: must be group admin (check groupData.admins.includes(userId))

// Compute month boundaries for last N months:
// e.g., for months=6: generate array of { start: Date, end: Date, label: "YYYY-MM" }
// for each calendar month from 6 months ago to current month

// attendanceTrend: for each month, query meetingInstances
//   .where("groupId", "==", groupId)
//   .where("scheduledAt", ">=", monthStart)
//   .where("scheduledAt", "<", monthEnd)
//   .where("isCancelled", "==", false)
// Sum attendeeCount across all docs in month, divide by count → avg
// Note: meetingInstances collection uses top-level path, not subcollection

// treasuryTrend: for each month, query transactions
//   .where("groupId", "==", groupId)
//   .where("createdAt", ">=", monthStart)
//   .where("createdAt", "<", monthEnd)
// Sum income/expense separately

// engagementTrend: for each month, query group_chats/{groupId}/messages
//   .where("sentAt", ">=", monthStart)
//   .where("sentAt", "<", monthEnd)
// Count unique senderIds, divide by totalMembers → engagement %
// If chat collection doesn't exist, return 0 gracefully with try/catch

// retention: single current-snapshot calculation
// Query group_members where groupId == groupId
// For each member, check if they appear in meetingInstances.attendees[]
//   in the last 90 days — OR use UserDocument.activityLog.lastMeetingAttendance
// Because per-member meetingInstance queries are expensive, use a simpler proxy:
//   "active" = member joined and not left, where UserDocument.lastActivityAt > 90 days ago
//   Load group_members docs (already scoped to one group, reasonable size)
//   For each, load the users/{userId} doc to get lastActivityAt
//   This is O(memberCount) reads — acceptable for groups up to ~200 members
//   For very large groups: cap at 200, return isApproximate: true flag
```

**Export from `functions/src/index.ts`:** Add `export { getGroupHealthTimeSeries } from "./callable/getGroupHealthTimeSeries";`

---

### Task 1.2: `groupHealthSlice.ts` Redux Slice

**File:** `mobile/src/store/slices/groupHealthSlice.ts`

**Pattern:** Mirrors `dashboardSlice.ts` exactly — no entity adapter needed since this is a single result object per group, not an entity collection.

```typescript
// State type:
interface GroupHealthState {
  data: GetGroupHealthTimeSeriesResult | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

// Thunk: fetchGroupHealth({ groupId, months })
// Callable: functions().httpsCallable('getGroupHealthTimeSeries')
// Converts ISO strings back to display format in the reducer

// Selectors:
//   selectGroupHealthData(state)
//   selectGroupHealthLoading(state)
//   selectGroupHealthError(state)
```

**Modify:** `mobile/src/store/index.ts` (or wherever reducers are combined) — add `groupHealth: groupHealthReducer`.

---

### Task 1.3: `GroupHealthDashboardScreen.tsx`

**File:** `mobile/src/screens/homegroup/GroupHealthDashboardScreen.tsx`

**Screen layout:**
```
[ScrollView]
  [Header: "Group Health" | Period picker: "3M  6M  12M" segmented control]

  ── RETENTION ──────────────────────────────────────────
  [Card: "Member Retention"]
    [Two large numbers side by side]
      "42 Active"  |  "8 Inactive"
    [Subtext: "Active = app activity in last 90 days"]
    [Donut chart: VictoryPie with 2 slices — green/grey]
  ─────────────────────────────────────────────────────

  ── ATTENDANCE TREND ───────────────────────────────────
  [Card: "Avg. Attendance per Meeting"]
    [VictoryChart + VictoryLine]
      X-axis: month labels (Jan, Feb, Mar...)
      Y-axis: attendee count
      Data: attendanceTrend array
    [Subtext: "Based on QR check-in data"]
  ─────────────────────────────────────────────────────

  ── TREASURY TREND ─────────────────────────────────────
  [Card: "Monthly Income vs. Expenses"]
    [VictoryChart + VictoryBar (grouped)]
      X-axis: months
      Y-axis: dollars
      Two bars per month: income (green) + expenses (red)
    [Legend: ■ Income  ■ Expenses]
  ─────────────────────────────────────────────────────

  ── ENGAGEMENT ─────────────────────────────────────────
  [Card: "Member Engagement"]
    [VictoryChart + VictoryArea]
      X-axis: months
      Y-axis: percentage (0–100%)
      Data: engagementTrend (% of members active in group chat per month)
    [Subtext: "% of members who sent a message in the group chat"]
  ─────────────────────────────────────────────────────

  [Last updated: "Updated 2 minutes ago"  |  [Refresh]]
```

**Empty states:** If `attendanceTrend` has all zeros (no check-in data yet), show: "No check-in data yet. Enable QR check-in at your next meeting to start tracking attendance."

**Access control:** Screen should only be reachable by admins. The navigation button in `GroupOverviewScreen` is already gated by `isCurrentUserAdmin()`.

**Navigation route params:**
```typescript
GroupHealthDashboard: { groupId: string; groupName: string }
```

---

### Task 1.4: Wire Up Navigation

**Files to modify:**
- `mobile/src/navigation/GroupStackNavigator.tsx` — add `GroupHealthDashboard` route pointing to `GroupHealthDashboardScreen`
- `mobile/src/types/navigation/index.ts` — add to `GroupStackParamList`:
  ```typescript
  GroupHealthDashboard: { groupId: string; groupName: string };
  ```
- `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` — add a new nav tile in the Admin Actions section:
  ```tsx
  <TouchableOpacity
    style={[styles.adminButton, styles.healthButton]}
    onPress={() => navigation.navigate('GroupHealthDashboard', { groupId, groupName })}
    testID="group-admin-health-button">
    <Icon name="chart-line" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
    <Text style={styles.healthButtonText}>Group Health</Text>
  </TouchableOpacity>
  ```
  Style: use `#6A1B9A` (purple) to distinguish from the existing blue "View Dashboard" and green "Referral Program" buttons.

**Effort estimate: 3-4 hrs**

---

## V4.3.2: Attendance Analytics

**Why:** Attendance trends per individual meeting (not group-aggregate) let admins see that Tuesday's Big Book meeting draws 22 people but Thursday's discussion draws only 8 — and whether either is trending. This informs scheduling decisions.

**What already exists:** `meetingInstances` documents already have `attendeeCount` (denormalized) and `meetingId`. The existing `getGroupDashboardMetrics` CF queries instances for a single period. No per-meeting time series exists.

---

### Task 2.1: `getAttendanceAnalytics` Cloud Function

**File:** `functions/src/callable/getAttendanceAnalytics.ts`

**Input/output types:**
```typescript
interface GetAttendanceAnalyticsData {
  groupId: string;
  meetingId?: string;  // If provided: per-meeting analytics. If omitted: all meetings.
  months: 3 | 6 | 12;
}

interface MeetingAttendanceSummary {
  meetingId: string;
  meetingName: string;
  dayOfWeek: string;         // "Monday", "Tuesday", etc.
  avgAttendance: number;
  maxAttendance: number;
  minAttendance: number;
  instanceCount: number;     // How many instances were held (not cancelled)
  trend: MonthlyDataPoint[]; // Month-by-month avg attendance
}

interface AttendanceByDayOfWeek {
  day: string;     // "Mon", "Tue", etc.
  avgCount: number;
  instanceCount: number;
}

interface GetAttendanceAnalyticsResult {
  groupId: string;
  months: number;
  meetings: MeetingAttendanceSummary[];     // One entry per meeting template
  byDayOfWeek: AttendanceByDayOfWeek[];     // Aggregated across all meetings
  overallAvg: number;
  bestAttendedMeetingId?: string;
  computedAt: string;
}
```

**Implementation logic:**
```typescript
// Auth: must be group admin

// 1. Query meetingInstances top-level collection:
//    .where("groupId", "==", groupId)
//    .where("scheduledAt", ">=", rangeStart)   // rangeStart = N months ago
//    .where("isCancelled", "==", false)
//    Note: attendeeCount field may be 0 or undefined for old instances.

// 2. Group instances by meetingId.
//    For each meetingId group:
//      - Compute avg/max/min of attendeeCount
//      - Bucket by month label to build trend[]
//      - meetingName: use the name field on the instance doc
//      - dayOfWeek: derive from scheduledAt.toDate().getDay()

// 3. byDayOfWeek: bucket all instances by day-of-week, compute avg per day.

// 4. If meetingId filter provided, return only that meeting's data in meetings[]
//    (but still compute byDayOfWeek for that meeting's instances only).
```

---

### Task 2.2: `AttendanceAnalyticsScreen.tsx`

**File:** `mobile/src/screens/homegroup/AttendanceAnalyticsScreen.tsx`

**Screen layout:**
```
[Header: "Attendance Analytics"]
[Period picker: 3M  6M  12M]

── OVERVIEW ────────────────────────────────────────────
[Card: "Overall Attendance"]
  [Stat row: "Avg per meeting: 14.2" | "Best meeting: Tuesday Big Book (22 avg)"]

── BY MEETING ──────────────────────────────────────────
[Card: "Meetings Breakdown"]
  [Horizontal scroll FlatList of meeting cards]
  Each card (140×100 px):
    [Meeting name]
    [Avg: 14]  [↑ +2 vs prev period]
    [Tap → drills into per-meeting detail]

── PER-MEETING TREND (shown when a meeting is selected) ──
[Card: "{Meeting Name} Trend"]
  [VictoryChart + VictoryLine]
    X: months  Y: avg attendance
  [Stat row: Max | Min | Held | Cancelled]

── BY DAY OF WEEK ──────────────────────────────────────
[Card: "Attendance by Day of Week"]
  [VictoryChart + VictoryBar]
    X: Mon Tue Wed Thu Fri Sat Sun
    Y: avg attendance
  [Subtext: "All meetings combined"]
```

**No new Redux slice needed.** Use local `useState` + direct `functions().httpsCallable('getAttendanceAnalytics')` call pattern (same as `handleStripeConnectSetup` in `GroupOverviewScreen`). Data is admin-only and not shared across screens, so Redux caching adds little value here.

**Navigation route params:**
```typescript
AttendanceAnalytics: { groupId: string; groupName: string }
```

**Files to modify:**
- `mobile/src/navigation/GroupStackNavigator.tsx` — add route
- `mobile/src/types/navigation/index.ts` — add `AttendanceAnalytics: { groupId: string; groupName: string }`
- `mobile/src/screens/homegroup/GroupHealthDashboardScreen.tsx` — add "See Full Attendance Report →" link at the bottom of the attendance trend card

**Effort estimate: 2-3 hrs**

---

## V4.3.3: Treasury Trend Reports & CSV Export

**Why:** Admins currently see current balance and monthly totals in the existing admin dashboard. They cannot see whether expenses have been creeping up over a year, whether a particular expense category dominates, or generate a year-end overview for the group treasurer's report. This section builds monthly/quarterly/annual views and a category-breakdown pie chart.

**What already exists:**
- `transactions` collection (top-level, `groupId` field, `type`, `amount`, `category`, `createdAt`).
- `TreasuryOverviewDocument` at `treasury_overviews` with `balance`, `monthlyIncome`, `monthlyExpenses`.
- `YearEndSummaryScreen` already exists and generates a year-end PDF via `TreasuryReportService`. This screen handles year-end export — do not duplicate it.
- `react-native-html-to-pdf` is installed.

**Scope:** This section adds *trend views* (charts across multiple periods) and *category breakdown* (pie), plus a CSV export of raw transactions. The year-end narrative PDF already exists.

---

### Task 3.1: `getTreasuryTrends` Cloud Function

**File:** `functions/src/callable/getTreasuryTrends.ts`

**Input/output types:**
```typescript
interface GetTreasuryTrendsData {
  groupId: string;
  granularity: 'monthly' | 'quarterly';
  periods: number; // How many periods back: 6 months, 4 quarters, etc.
}

interface PeriodTreasuryData {
  label: string;       // "Jan 2026" or "Q1 2026"
  income: number;
  expenses: number;
  net: number;         // income - expenses
  runningBalance?: number; // Cumulative running balance (requires starting balance)
}

interface CategoryTotal {
  category: string;
  total: number;
  percentage: number;  // of total expenses (or income)
  type: 'income' | 'expense';
}

interface GetTreasuryTrendsResult {
  groupId: string;
  granularity: 'monthly' | 'quarterly';
  periods: number;
  trend: PeriodTreasuryData[];
  expenseCategories: CategoryTotal[];   // For pie chart
  incomeCategories: CategoryTotal[];    // For pie chart
  currentBalance: number;               // From treasury_overviews
  totalIncomeAllPeriods: number;
  totalExpensesAllPeriods: number;
  computedAt: string;
}
```

**Implementation logic:**
```typescript
// Auth: must be group admin (check groupData.admins)

// 1. Determine period buckets:
//    monthly: last N calendar months
//    quarterly: last N calendar quarters (Q1=Jan-Mar, Q2=Apr-Jun, etc.)

// 2. For each bucket, query transactions:
//    .where("groupId", "==", groupId)
//    .where("createdAt", ">=", bucketStart)
//    .where("createdAt", "<", bucketEnd)
//    Sum income and expense separately.

// 3. Running balance: fetch currentBalance from treasury_overviews where groupId == groupId
//    Work backwards from current balance:
//    runningBalance[last_period] = currentBalance
//    runningBalance[n-1] = runningBalance[n] - trend[n].net
//    (Approximate — doesn't account for opening balance before first transaction)

// 4. Category breakdown: query all transactions in the full date range
//    (not per-period), group by category+type, compute totals and percentages.
//    Sort descending by total.
```

---

### Task 3.2: CSV Export Utility

**File:** `mobile/src/services/reports/TreasuryExportService.ts`

**Pattern:** Follows `TreasuryReportService.ts` exactly.

```typescript
export class TreasuryExportService {
  /**
   * Generates a CSV string from raw transaction data.
   * Fields: Date, Type, Category, Description, Amount
   */
  static generateCSV(transactions: TransactionDocument[]): string {
    const header = 'Date,Type,Category,Description,Amount\n';
    const rows = transactions.map(tx => {
      const date = tx.createdAt.toDate().toLocaleDateString('en-US');
      const amount = tx.type === 'expense' ? `-${tx.amount.toFixed(2)}` : tx.amount.toFixed(2);
      const desc = (tx.description || '').replace(/,/g, ';'); // Escape commas
      return `${date},${tx.type},${tx.category},${desc},${amount}`;
    });
    return header + rows.join('\n');
  }

  /**
   * Writes CSV to a temp file using RNHTMLtoPDF, then shares it.
   * Wraps CSV in minimal HTML so RNHTMLtoPDF can write a .txt file.
   * Alternative: write directly with react-native-fs if installed.
   */
  static async exportAndShare(
    transactions: TransactionDocument[],
    groupName: string,
    periodLabel: string,
  ): Promise<void> {
    const csv = this.generateCSV(transactions);
    // Use Share.share from react-native core (no new package needed):
    await Share.share({
      title: `${groupName} Treasury ${periodLabel}.csv`,
      message: csv,  // On iOS this shares as text; on Android may need a file
    });
    // Note: for a proper .csv file attachment, react-native-fs would be needed
    // (not currently installed). The Share.share text approach works for email.
    // If a proper file attachment is required, add: yarn add react-native-fs
    // and use RNFS.writeFile to write the CSV then share the file path.
  }
}
```

**Decision on file export:** `react-native-html-to-pdf` cannot write CSV. `Share.share({ message: csvString })` works for email/clipboard. Document this limitation in code comments. If a real `.csv` file attachment is needed, `react-native-fs` must be added (document in plan but defer to implementation decision).

---

### Task 3.3: `TreasuryTrendsScreen.tsx`

**File:** `mobile/src/screens/homegroup/TreasuryTrendsScreen.tsx`

**Screen layout:**
```
[Header: "Treasury Trends"]

[Segmented control: Monthly | Quarterly]
[Period count stepper: "Last 6" with ← → buttons, range 3-12]

── INCOME vs. EXPENSES ─────────────────────────────────
[Card: "Income vs. Expenses"]
  [VictoryChart + grouped VictoryBar]
    X: period labels  Y: dollars
    Green bars: income  |  Red bars: expenses
  [Summary row: "Total Income: $540  |  Total Expenses: $312"]

── RUNNING BALANCE ─────────────────────────────────────
[Card: "Running Balance"]
  [VictoryChart + VictoryLine + VictoryArea (filled below line)]
    X: periods  Y: balance ($)
  [Current balance badge: "$228 today"]

── EXPENSE BREAKDOWN ───────────────────────────────────
[Card: "Where Did the Money Go?"]
  [VictoryPie with labels]
    Slices: each expense category (7th Tradition, Literature, Rent, etc.)
  [Legend below: colored circles + category name + % + $amount]
  [Toggle: Expenses | Income — same pie for income categories]

── EXPORT ──────────────────────────────────────────────
[Button: "Export as CSV" → calls TreasuryExportService.exportAndShare]
  [Subtext: "Exports all transactions in the selected period range"]
[Button: "Full Year-End Report →" → navigates to YearEndSummary]
```

**Data loading:** Direct callable call (`functions().httpsCallable('getTreasuryTrends')`) in a `useEffect` with local state, following the `AdminDashboardScreen` pattern. No new Redux slice — treasurer reports are large and ephemeral; caching adds complexity without benefit.

For the CSV export, a second callable or a direct Firestore query fetches raw transactions. Use Firestore client SDK directly:
```typescript
// In the export handler:
const txSnap = await firestore()
  .collection('transactions')
  .where('groupId', '==', groupId)
  .where('createdAt', '>=', rangeStart)
  .orderBy('createdAt', 'asc')
  .get();
const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
await TreasuryExportService.exportAndShare(transactions, groupName, periodLabel);
```

**Navigation route params:**
```typescript
TreasuryTrends: { groupId: string; groupName: string }
```

**Files to modify:**
- `mobile/src/navigation/GroupStackNavigator.tsx` — add route
- `mobile/src/types/navigation/index.ts` — add `TreasuryTrends: { groupId: string; groupName: string }`
- `mobile/src/screens/homegroup/GroupTreasuryScreen.tsx` — add "Trends & Reports →" button in the header or at the bottom of the screen (admin-only)

**Firestore security rules:** The `transactions` client-side read above requires that Firestore rules allow admins to read `transactions` scoped by `groupId`. Verify `firestore.rules` allows:
```javascript
match /transactions/{txId} {
  allow read: if request.auth != null
    && isGroupAdmin(resource.data.groupId);
}
```
If the rule currently only allows group members (not specifically admins) to read transactions, it is already sufficient — no rule change needed. Verify before implementation.

**Effort estimate: 3-4 hrs**

---

## V4.3.4: Member Engagement Metrics

**Why:** Admins want to know if their group is losing engagement — not to surveil individuals, but to decide whether to send an announcement, plan a special event, or reach out as a group. The UI shows *only* aggregate counts ("32 of 45 members active this month") — never a list of who is or isn't active.

**Privacy principle:** No individual member's activity is displayed to the admin. All outputs are aggregate numbers. This is enforced at the Cloud Function level, not the UI level, since the CF controls what data is returned.

**What already exists:**
- `GroupDashboardMetrics.memberEngagementRate` — already computed by `getGroupDashboardMetrics`. This returns a single-period float (e.g., 0.71 for 71%).
- `UserDocument.lastActivityAt` — exists and is set by `onMemberWrite.ts` trigger.
- `UserDocument.activityLog.lastMeetingAttendance` — exists.

**Gap:** The existing `memberEngagementRate` in `getGroupDashboardMetrics` computes "members who haven't left" / totalMembers — not a meaningful activity measure. A dedicated CF is needed that defines "active" as having `lastActivityAt` within a configurable window.

---

### Task 4.1: `getMemberEngagementMetrics` Cloud Function

**File:** `functions/src/callable/getMemberEngagementMetrics.ts`

**Input/output types:**
```typescript
interface GetMemberEngagementMetricsData {
  groupId: string;
}

interface EngagementWindow {
  windowDays: 30 | 60 | 90;
  activeCount: number;
  totalMembers: number;
  percentage: number;  // 0-100
}

interface GetMemberEngagementMetricsResult {
  groupId: string;
  totalMembers: number;
  windows: EngagementWindow[];  // Always 3 entries: 30d, 60d, 90d
  // Source: lastActivityAt on UserDocument
  // "Active" = lastActivityAt within the window AND not leftAt
  dataAvailabilityNote?: string;
  // e.g., "Activity data available for 38 of 45 members"
  // (some members may predate lastActivityAt tracking)
  computedAt: string;
}
```

**Implementation logic:**
```typescript
// Auth: must be group admin

// 1. Query group_members where groupId == groupId to get all member userIds.
//    (Use top-level group_members collection: .where("groupId", "==", groupId))

// 2. For each member, load users/{userId} to get lastActivityAt.
//    Batch in groups of 10 with Promise.all — do NOT load all serially.
//    Cap at 500 members; for larger groups return a random sample of 500 with a note.

// 3. For each window (30, 60, 90 days):
//    windowStart = now - windowDays
//    activeCount = members where lastActivityAt >= windowStart

// 4. Return aggregate counts only. No userId or displayName in the response.

// Performance note: O(memberCount) Firestore reads.
// For a typical homegroup (15-50 members) this is fast.
// For 500 members: 500 reads × ~0.06ms latency = ~30ms total (parallel batching).
```

---

### Task 4.2: Engagement Metrics Section in `AdminDashboardScreen`

**Do not create a new screen.** Extend the existing `AdminDashboardScreen.tsx` by adding an "Engagement" card section at the bottom.

**File to modify:** `mobile/src/screens/homegroup/AdminDashboardScreen.tsx`

**Addition to the screen (after existing metric cards):**
```
── MEMBER ENGAGEMENT ───────────────────────────────────
[Card: "Member Engagement"]
  [Loading state while fetchEngagementMetrics runs]

  [Three progress bars:]
    Last 30 days   ████████░░  32 / 45 members  (71%)
    Last 60 days   ██████████  40 / 45 members  (89%)
    Last 90 days   ██████████  43 / 45 members  (96%)

  [Subtext: "Based on app activity. Tap 'Group Health' for trend charts."]
  [If dataAvailabilityNote present: show in grey italic below the bars]
```

**Implementation:** Add a second `useEffect` in `AdminDashboardScreen` that calls `getMemberEngagementMetrics` after the main metrics load. Store result in local `useState<GetMemberEngagementMetricsResult | null>`. No Redux slice needed — data is admin-only and not used elsewhere.

```typescript
// Inline progress bar component (no new package — pure View with backgroundColor):
const ProgressBar: React.FC<{ percentage: number; label: string; fraction: string }> = ...
// View with absolute-positioned filled View inside (width: `${percentage}%`)
```

**No new navigation route.** This is an in-place addition to an existing screen.

**Effort estimate: 2-3 hrs**

---

## V4.3.5: Personal Sobriety Insights ("My Recovery Journey")

**Why:** Members currently have separate, disconnected profile screens: `SobrietyTrackerScreen` (days sober), `CheckInStreakScreen` (meeting check-in streak), `GratitudeJournalScreen` (journal entries), `StepTrackerScreen` (step progress). None of them reference each other. "My Recovery Journey" is a single summary screen that brings all four into one motivating view — their personal recovery dashboard.

**Privacy:** This is a private, member-only, individual-only view. No group admin can see it. No aggregate data from this screen is ever sent anywhere. The screen reads only from the current user's own Firestore documents.

**What already exists (no new CF needed):**
- `UserDocument.sobrietyStartDate` — for days sober calculation.
- `UserDocument.checkInStreak.currentStreak` and `longestStreak` — already tracked.
- `GratitudeEntryDocument` at `users/{userId}/gratitudeEntries/{YYYY-MM-DD}` — queryable client-side.
- `StepProgressDocument` at `users/{userId}/stepProgress/current` — already loaded by `stepWorkSlice`.
- `MeetingInstanceDocument.attendees[]` — contains userId; queryable client-side to count meetings attended.

**All data reads are client-side Firestore queries from the current user's own documents.** No Cloud Function is needed.

---

### Task 5.1: `MyRecoveryJourneyScreen.tsx`

**File:** `mobile/src/screens/profile/MyRecoveryJourneyScreen.tsx`

**Screen layout:**
```
[ScrollView]

── SOBRIETY ────────────────────────────────────────────
[Card: "My Sobriety" — teal/blue gradient header]
  [Large center number: "847 Days"]
  [Subtext: "Sober since March 21, 2023"]
  [Milestone chips (horizontal scroll):]
    [✓ 30d] [✓ 60d] [✓ 90d] [✓ 180d] [✓ 1yr] [✓ 2yr] [ 3yr]
    (Derive from sobrietyStartDate: compute which standard thresholds have passed)
  [→ View Sobriety Tracker (navigates to SobrietyTrackerScreen)]

── MEETING ATTENDANCE ──────────────────────────────────
[Card: "Meetings Attended"]
  [Stat row: "28 this year  |  147 total"]
  [Mini bar chart — VictoryBar, last 6 months of meeting attendance]
    Data: query meetingInstances where attendees array-contains currentUser.uid
    Group by month, count per month.
  [Streak row: "Current streak: 8 weeks  |  Longest: 22 weeks"]
  [→ View Check-In Streak (navigates to CheckInStreakScreen)]

── STEP WORK ───────────────────────────────────────────
[Card: "Step Work"]
  [Progress indicator: Step 9 of 12]
  [Steps 1-12 grid: filled circles for completed, hollow for pending]
    Each circle tappable → navigates to StepTrackerScreen on that step
  [Subtext: "Started Step 9 on Jan 14, 2026 (39 days ago)"]
  [→ Open Step Tracker]

── GRATITUDE JOURNAL ───────────────────────────────────
[Card: "Gratitude Journal"]
  [Stat: "62 entries this year  |  Last entry: today"]
  [Calendar heatmap — 12 weeks of squares (like GitHub contribution graph)]
    Each square = a day; filled = entry exists; empty = no entry
    Use a simple grid of Views (7 columns × 12 rows) — no new package needed
    Color scale: empty=#F5F5F5, has_entry=#4CAF50
  [→ Open Gratitude Journal]

── PERSONAL BEST ────────────────────────────────────────
[Card: "Recovery Highlights"]
  [Three milestone badges (icon + label):]
    [Trophy] Longest streak: 22 weeks
    [Star]   Steps completed: 8 of 12
    [Heart]  Gratitude entries: 62
```

**Data loading strategy:**
```typescript
// All loaded in a single useEffect with Promise.all:
const [journeyData, setJourneyData] = useState<JourneyData | null>(null);

useEffect(() => {
  const loadData = async () => {
    const uid = auth().currentUser?.uid;
    if (!uid) return;

    const [userSnap, stepSnap, gratitudeSnaps, meetingSnaps] = await Promise.all([
      // 1. User doc — for sobrietyStartDate and checkInStreak
      firestore().collection('users').doc(uid).get(),

      // 2. Step progress singleton
      firestore().collection('users').doc(uid)
        .collection('stepProgress').doc('current').get(),

      // 3. Gratitude entries for current year
      firestore().collection('users').doc(uid)
        .collection('gratitudeEntries')
        .where('date', '>=', `${currentYear}-01-01`)
        .get(),

      // 4. Meeting instances attended this year
      //    WARNING: This query requires a composite index on meetingInstances:
      //    (attendees ARRAY_CONTAINS, scheduledAt ASC)
      //    Create the index in Firebase console or firestore.indexes.json.
      firestore().collection('meetingInstances')
        .where('attendees', 'array-contains', uid)
        .where('scheduledAt', '>=', yearStart)
        .get(),
    ]);
    // ... transform and setJourneyData
  };
  loadData();
}, []);
```

**Firestore composite index required:**
```json
// firestore.indexes.json — add to existing indexes array:
{
  "collectionGroup": "meetingInstances",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "attendees", "arrayConfig": "CONTAINS" },
    { "fieldPath": "scheduledAt", "order": "ASCENDING" }
  ]
}
```

**Navigation route params:**
```typescript
MyRecoveryJourney: undefined
// No params needed — always shows current user's own data
```

**Files to modify:**
- `mobile/src/navigation/ProfileNavigator.tsx` — add `MyRecoveryJourney` route
- `mobile/src/types/navigation/index.ts` — add to `ProfileStackParamList`:
  ```typescript
  MyRecoveryJourney: undefined;
  ```
- `mobile/src/screens/profile/ProfileScreen.tsx` — add a prominent "My Recovery Journey" card/button near the top of the profile screen, above the individual tracking cards. This is the entry point.

**Effort estimate: 2-3 hrs**

---

## Implementation Order

```
V4.3.1 (Group Health Dashboard)
  → V4.3.2 (Attendance Analytics)   [shares CF/screen patterns established in 4.3.1]
  → V4.3.3 (Treasury Trends)        [independent; shares TreasuryExportService pattern]
  → V4.3.4 (Member Engagement)      [extends AdminDashboardScreen; low risk]
  → V4.3.5 (My Recovery Journey)    [purely client-side; lowest risk; no CF]
```

**Rationale:**
- Start with Group Health Dashboard (4.3.1) because it establishes the victory-native chart patterns, the time-series CF pattern, and the `groupHealthSlice` that all other admin analytics screens reference.
- Attendance Analytics (4.3.2) comes immediately after because it reuses all of those patterns — copy the CF structure, copy the chart component usage, add the meeting-specific grouping.
- Treasury Trends (4.3.3) is independent of attendance and can be worked on in parallel by a second developer. The CSV export is a quick win.
- Member Engagement (4.3.4) extends an existing screen rather than creating a new one — lower risk and smaller scope, good for late in the sprint.
- My Recovery Journey (4.3.5) is the safest task: no new CF, no new Redux slice, all reads from the current user's own documents. Perfect for last because it has no blockers from other tasks and can be delivered incrementally.

---

## File Reference

**New Cloud Functions:**
- `functions/src/callable/getGroupHealthTimeSeries.ts`
- `functions/src/callable/getAttendanceAnalytics.ts`
- `functions/src/callable/getTreasuryTrends.ts`
- `functions/src/callable/getMemberEngagementMetrics.ts`

**New screens:**
- `mobile/src/screens/homegroup/GroupHealthDashboardScreen.tsx`
- `mobile/src/screens/homegroup/AttendanceAnalyticsScreen.tsx`
- `mobile/src/screens/homegroup/TreasuryTrendsScreen.tsx`
- `mobile/src/screens/profile/MyRecoveryJourneyScreen.tsx`

**New Redux slice:**
- `mobile/src/store/slices/groupHealthSlice.ts`

**New service:**
- `mobile/src/services/reports/TreasuryExportService.ts`

**Modified files:**
- `functions/src/index.ts` — export 4 new CFs
- `mobile/src/navigation/GroupStackNavigator.tsx` — add 3 new routes
- `mobile/src/navigation/ProfileNavigator.tsx` — add MyRecoveryJourney route
- `mobile/src/types/navigation/index.ts` — add 3 entries to `GroupStackParamList`, 1 to `ProfileStackParamList`
- `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` — add "Group Health" admin button
- `mobile/src/screens/homegroup/AdminDashboardScreen.tsx` — add engagement metrics card
- `mobile/src/screens/homegroup/GroupTreasuryScreen.tsx` — add "Trends & Reports →" entry point
- `mobile/src/screens/homegroup/GroupHealthDashboardScreen.tsx` — link to AttendanceAnalytics
- `mobile/src/screens/profile/ProfileScreen.tsx` — add My Recovery Journey entry point
- `firestore.indexes.json` — add composite index for meetingInstances attendees+scheduledAt

**New npm packages:**
- `victory-native` — charts (VictoryLine, VictoryBar, VictoryPie, VictoryArea, VictoryChart, VictoryAxis)
- `react-native-svg` — required peer dep of victory-native (check if already installed first)
- Optional/deferred: `react-native-fs` — if proper `.csv` file attachment is required for Treasury export

---

## Firestore Schema Additions

No new collections are needed for this version. All queries hit existing collections. The only schema-adjacent change is the composite Firestore index on `meetingInstances` documented above.

If `UserDocument.lastActivityAt` is not being reliably set for all members (it is set by the `onMemberWrite` trigger today), the `getMemberEngagementMetrics` CF should handle missing `lastActivityAt` gracefully and include those members in the `dataAvailabilityNote` count rather than throwing.

---

## V4.3 Success Metrics

| Metric | Target | How measured |
|--------|--------|--------------|
| Group Health screen opens per admin per month | > 4 | Firestore read event on `getGroupHealthTimeSeries` CF invocations |
| Treasury CSV exports | > 20% of subscribed groups per quarter | `getTreasuryTrends` invocation + export button tap event |
| My Recovery Journey opens per member per week | > 1 | Firestore read on `users/{uid}/stepProgress` from `MyRecoveryJourneyScreen` |
| Attendance analytics screen opens | > 2 per admin per month | `getAttendanceAnalytics` CF invocations |
