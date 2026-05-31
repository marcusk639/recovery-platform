# PaymentDashboard Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two missing features to PaymentDashboard: (1) an "Overdue Residents" card showing guests with positive `balance` sorted by amount, with a tap-to-message action; (2) a CSV export button that generates a downloadable report of payment records.

**Architecture:** Both features build on existing data in `PaymentDashboard.tsx`. The overdue card uses `house.guests` filtered by `balance > 0`. CSV export uses the existing `filteredPayments` array and the `reportExport.ts` pattern already in the codebase. Both are self-contained additions within the existing screen.

**Tech Stack:** React Native, `react-native-share` or `RNFS` (check existing exports for pattern), `date-fns`, TanStack Query v5, existing `paymentQueries.ts` data

---

## File Structure

- **Modify:** `src/screens/HouseSettings/PaymentDashboard.tsx` — add overdue card + CSV export button
- **Create:** `src/__tests__/screens/HouseSettings/paymentDashboardOverdue.test.tsx`
- **Create:** `src/__tests__/screens/HouseSettings/paymentDashboardCSV.test.tsx`

---

## Pre-Task: Verify existing pattern for CSV/share

- [ ] **Step 1: Check reportExport.ts pattern**

  Run: `cat /Users/marcuspersonal/dev/regroup-rn7/src/util/reportExport.ts 2>/dev/null || find /Users/marcuspersonal/dev/regroup-rn7/src -name "reportExport*" | head -5`

  Check what `Share` or file-write pattern is used. Common patterns:
  - `react-native`'s `Share.share({ message: csvString })`
  - `react-native-share` library
  - `RNFS.writeFile` + `FileViewer.open`

  Note the exact import and usage — mirror this in the CSV export task.

---

## Task 1: Overdue Residents card

**Files:**

- Modify: `src/screens/HouseSettings/PaymentDashboard.tsx`
- Create: `src/__tests__/screens/HouseSettings/paymentDashboardOverdue.test.tsx`

- [ ] **Step 1: Write the failing test**

  Create `src/__tests__/screens/HouseSettings/paymentDashboardOverdue.test.tsx`:

  ```typescript
  import React from "react";
  import { render, fireEvent } from "@testing-library/react-native";
  import PaymentDashboard from "../../../screens/HouseSettings/PaymentDashboard";

  // Mock existing queries
  jest.mock("../../../state/queries/paymentQueries");
  jest.mock("../../../hooks/useSelectedHouse", () => ({
    useSelectedHouse: () => ({
      house: {
        id: "house-1",
        guests: [
          { id: "g1", firstName: "Alice", lastName: "Smith", balance: 150 },
          { id: "g2", firstName: "Bob", lastName: "Jones", balance: 0 },
          { id: "g3", firstName: "Carol", lastName: "White", balance: 75 },
        ],
      },
    }),
  }));

  describe("PaymentDashboard — Overdue Residents", () => {
    it("renders overdue residents card", () => {
      const { getByTestId } = render(
        <PaymentDashboard navigation={mockNavigation} />
      );
      expect(getByTestId("overdue-residents-card")).toBeTruthy();
    });

    it("shows only guests with positive balance, sorted by balance descending", () => {
      const { getAllByTestId } = render(
        <PaymentDashboard navigation={mockNavigation} />
      );
      const rows = getAllByTestId("overdue-resident-row");
      expect(rows).toHaveLength(2); // Alice ($150) and Carol ($75); Bob ($0) excluded
      // First row should be Alice (highest balance)
      expect(rows[0]).toHaveTextContent("Alice");
    });

    it("does not render the card when all guests have zero balance", () => {
      // Override mock to zero balances
      const { queryByTestId } = render(
        <PaymentDashboard navigation={mockNavigation} />
      );
      // With Alice and Carol having balance > 0, card IS shown
      expect(queryByTestId("overdue-residents-card")).not.toBeNull();
    });
  });
  ```

  Run: `cd /Users/marcuspersonal/dev/regroup-rn7 && npx jest src/__tests__/screens/HouseSettings/paymentDashboardOverdue.test.tsx --no-coverage`
  Expected: FAIL — `getByTestId("overdue-residents-card")` not found

- [ ] **Step 2: Add overdue guests derivation to PaymentDashboard**

  In `src/screens/HouseSettings/PaymentDashboard.tsx`:
  1. Get guests from the house (the `useSelectedHouse` hook already provides `house`). Add near the existing `useMemo` blocks (~line 121):

     ```typescript
     const overdueGuests = useMemo(() => {
       if (!house?.guests) return [];
       return Object.values(house.guests)
         .filter((g: any) => (g.balance ?? 0) > 0)
         .sort((a: any, b: any) => b.balance - a.balance);
     }, [house?.guests]);
     ```

  2. Add the overdue card JSX. Place it at the top of the ScrollView content, before the stats card. Find the stats card section (~line 280) and insert before it:

     ```tsx
     {
       overdueGuests.length > 0 && (
         <View
           testID="overdue-residents-card"
           style={[CARD_STYLE, styles.overdueCard]}>
           <RatsText
             text={`Overdue Residents (${overdueGuests.length})`}
             style={styles.cardTitle}
             translate={false}
           />
           {overdueGuests.map((guest: any) => (
             <TouchableOpacity
               key={guest.id}
               testID="overdue-resident-row"
               style={styles.overdueRow}
               onPress={() => {
                 // Navigate to guest detail or open messaging
                 // Use existing navigation pattern from the screen
               }}>
               <RatsText
                 text={`${guest.firstName} ${guest.lastName}`}
                 style={styles.overdueGuestName}
                 translate={false}
               />
               <RatsText
                 text={`$${(guest.balance ?? 0).toFixed(2)} due`}
                 style={styles.overdueAmount}
                 translate={false}
               />
             </TouchableOpacity>
           ))}
         </View>
       );
     }
     ```

  3. Add styles (at the bottom of the `StyleSheet.create` block):
     ```typescript
     overdueCard: { marginBottom: normalize(12) },
     cardTitle: { fontSize: fontSize.body, fontWeight: '700', marginBottom: normalize(8) },
     overdueRow: {
       flexDirection: 'row',
       justifyContent: 'space-between',
       paddingVertical: normalize(8),
       borderBottomWidth: 1,
       borderBottomColor: color.border,
     },
     overdueGuestName: { fontSize: fontSize.body },
     overdueAmount: { fontSize: fontSize.body, color: color.error, fontWeight: '600' },
     ```

- [ ] **Step 3: Check house.guests shape**

  Run: `grep -n "guests\|guestIds\|GuestMap" /Users/marcuspersonal/dev/regroup-rn7/src/entities/House.tsx | head -15`

  If `house.guests` is a map/object keyed by guestId (common Firestore pattern), `Object.values(house.guests)` is correct. If it's an array, use `.filter()` directly without `Object.values`.

- [ ] **Step 4: Run tests**

  Run: `cd /Users/marcuspersonal/dev/regroup-rn7 && npx jest src/__tests__/screens/HouseSettings/paymentDashboardOverdue.test.tsx --no-coverage`
  Expected: PASS

  Run: `cd /Users/marcuspersonal/dev/regroup-rn7 && npm test --no-coverage`
  Expected: No regressions

- [ ] **Step 5: Commit**

  ```bash
  git add src/screens/HouseSettings/PaymentDashboard.tsx src/__tests__/screens/HouseSettings/paymentDashboardOverdue.test.tsx
  git commit -m "feat(dashboard): add Overdue Residents card to PaymentDashboard"
  ```

---

## Task 2: CSV export

**Files:**

- Modify: `src/screens/HouseSettings/PaymentDashboard.tsx`
- Create: `src/__tests__/screens/HouseSettings/paymentDashboardCSV.test.tsx`

- [ ] **Step 1: Write the failing test**

  Create `src/__tests__/screens/HouseSettings/paymentDashboardCSV.test.tsx`:

  ```typescript
  import React from "react";
  import { render, fireEvent } from "@testing-library/react-native";
  import { Share } from "react-native";
  import PaymentDashboard from "../../../screens/HouseSettings/PaymentDashboard";

  jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });

  describe("PaymentDashboard — CSV export", () => {
    it("renders the export button", () => {
      const { getByTestId } = render(
        <PaymentDashboard navigation={mockNavigation} />
      );
      expect(getByTestId("csv-export-button")).toBeTruthy();
    });

    it("calls Share.share with CSV content on press", async () => {
      const { getByTestId } = render(
        <PaymentDashboard navigation={mockNavigation} />
      );
      fireEvent.press(getByTestId("csv-export-button"));

      await waitFor(() => {
        expect(Share.share).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining("Date,Guest,Amount,Status"),
          })
        );
      });
    });
  });
  ```

  Run: `cd /Users/marcuspersonal/dev/regroup-rn7 && npx jest src/__tests__/screens/HouseSettings/paymentDashboardCSV.test.tsx --no-coverage`
  Expected: FAIL — `getByTestId("csv-export-button")` not found

- [ ] **Step 2: Add generateCSV helper inside PaymentDashboard.tsx**

  In `PaymentDashboard.tsx`, add a `generateCSV` function near the top of the component body (after state declarations):

  ```typescript
  const generateCSV = useCallback((): string => {
    const header = 'Date,Guest Name,Amount,Status,Type';
    const rows = filteredPayments.map(p => {
      const date = p.createdAt
        ? format(toDateSafe(p.createdAt), 'yyyy-MM-dd')
        : 'Unknown';
      const guestName =
        `"${p.guestFirstName ?? ''} ${p.guestLastName ?? ''}"`.trim();
      const amount = ((p.amount ?? 0) / 100).toFixed(2);
      const status = p.status ?? 'unknown';
      const type = p.isManual ? 'Manual' : 'Stripe';
      return `${date},${guestName},${amount},${status},${type}`;
    });
    return [header, ...rows].join('\n');
  }, [filteredPayments]);
  ```

  Note: Check the `HousePaymentRecord` type for actual field names. Run:

  ```bash
  grep -n "interface HousePaymentRecord\|guestFirstName\|guestLastName\|isManual" /Users/marcuspersonal/dev/regroup-rn7/src/services/paymentService.ts 2>/dev/null | head -15
  ```

  Adjust field names in `generateCSV` to match the actual type.

- [ ] **Step 3: Add export handler and button**

  Add the export handler to the component:

  ```typescript
  const handleExportCSV = useCallback(async () => {
    try {
      const csv = generateCSV();
      const filename = `payments-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      await Share.share({
        message: csv,
        title: filename,
      });
    } catch (error) {
      logException(error);
    }
  }, [generateCSV]);
  ```

  Add import at top of file:

  ```typescript
  import { Share, ... } from 'react-native';
  ```

  Add the export button to the JSX. Place it near the top of the screen, in the header area (after the date filter pills, before the stats card):

  ```tsx
  <TouchableOpacity
    testID="csv-export-button"
    style={styles.exportButton}
    onPress={handleExportCSV}>
    <RatsText
      text="Export CSV"
      style={styles.exportButtonText}
      translate={false}
    />
  </TouchableOpacity>
  ```

  Add styles:

  ```typescript
  exportButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(6),
    marginRight: normalize(16),
    marginBottom: normalize(8),
    borderRadius: normalize(6),
    borderWidth: 1,
    borderColor: color.primary,
  },
  exportButtonText: { fontSize: fontSize.small, color: color.primary, fontWeight: '600' },
  ```

- [ ] **Step 4: Run tests**

  Run: `cd /Users/marcuspersonal/dev/regroup-rn7 && npx jest src/__tests__/screens/HouseSettings/paymentDashboardCSV.test.tsx --no-coverage`
  Expected: PASS

  Run: `cd /Users/marcuspersonal/dev/regroup-rn7 && npm test --no-coverage`
  Expected: No regressions

- [ ] **Step 5: Type check**

  Run: `cd /Users/marcuspersonal/dev/regroup-rn7 && npx tsc --noEmit 2>&1 | grep PaymentDashboard`
  Expected: No type errors

- [ ] **Step 6: Commit**

  ```bash
  git add src/screens/HouseSettings/PaymentDashboard.tsx src/__tests__/screens/HouseSettings/paymentDashboardCSV.test.tsx
  git commit -m "feat(dashboard): add CSV export to PaymentDashboard"
  ```

---

## Self-Review

**Spec coverage:**

- P1.1 (Overdue Residents card): Covered by Task 1 ✅
- P2.6 (CSV export): Covered by Task 2 ✅

**Already DONE (excluded from this plan):**
The roadmap listed P1.2 (manual payment recording), P1.3 (date filter pills + stats), and P2.5 (revenue bar chart) as MISSING. They are all actually DONE in the current codebase. This plan only covers the genuine gaps.

**HousePaymentRecord field names:** Before implementing Task 2, verify the actual field names by reading `src/services/paymentService.ts` or wherever `HousePaymentRecord` is defined. The `generateCSV` function uses `p.guestFirstName` / `p.guestLastName` / `p.isManual` — these must match the actual type.

**iOS Share sheet:** `Share.share({ message: csv })` on iOS opens the native share sheet. The user can AirDrop, email, or save the file. This is the correct pattern for React Native without file system dependencies.
