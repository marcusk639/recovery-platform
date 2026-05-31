# Oxford Treasury Dashboard — Design Spec

> **Status:** Approved (revised after research validation)
> **Date:** 2026-04-14
> **Target:** 4,324 Oxford Houses with zero competing treasury software
> **Tier:** Free for individual houses. Chapter rollups deferred to premium tier.
> **Research validation:** Confirmed against official Oxford House Treasurer Training materials, state association documents (VA, WA, NC, KS), and the Oxford House Manual.

---

## 1. Goal

Replace Oxford House manual checkbook ledgers with a digital treasury management system. Comptrollers create weekly Financial Status Reports (matching the official Oxford House form format). Treasurers or a second authorized officer approve reports. All house members can view approved reports for transparency (per Oxford tradition). The data model includes a `chapterId` field so chapter-level rollups can be added later without migration.

**Strategic value:** A March 2026 embezzlement case ($2,800 in forged checks at Oxford House Goose Creek, SC) demonstrates the real-world risk that digital controls with audit trails directly prevent.

---

## 2. Architecture

### New Files

```
src/services/treasury.ts                              # Treasury Firestore CRUD + approval logic
src/state/queries/treasuryQueries.ts                   # React Query hooks
src/screens/Treasury/TreasuryDashboard.tsx              # Summary cards + record list
src/screens/Treasury/FinancialRecordForm.tsx            # Create/edit weekly report
src/screens/Treasury/FinancialRecordDetail.tsx          # View report + approval
src/screens/Treasury/__tests__/TreasuryDashboard.test.tsx
src/screens/Treasury/__tests__/FinancialRecordForm.test.tsx
src/screens/Treasury/__tests__/FinancialRecordDetail.test.tsx
```

### Modified Files

```
src/entities/oxford/FinancialRecord.ts                 # Add status, approval, chapter, balance tracking fields
src/navigation/types.ts                                # Add Treasury routes
src/navigation/navigators.tsx                          # Register Treasury screens
src/screens/Oxford/OxfordDashboard.tsx                 # Add Treasury summary card
```

### Firestore Path

All data lives in the existing subcollection: `houses/{houseId}/financial-records/{recordId}`

No new collections. No new indexes required initially (queries are by houseId only, already scoped by subcollection path).

---

## 3. Data Model

### FinancialRecord (updated)

```typescript
interface FinancialRecord {
  // Existing fields (unchanged)
  id: string;
  houseId: string;
  period: string; // YYYY-MM-DD (week start, Monday)
  totalIncome: number; // Computed sum of incomeLines (cents)
  totalExpenses: number; // Computed sum of expenseLines (cents)
  balance: number; // totalIncome - totalExpenses (cents)
  breakdown: FinancialLineItem[]; // Kept for backward compat
  submittedBy: string; // Comptroller userId (person who created)
  submittedAt: string; // ISO timestamp
  approvedByVote: boolean; // Legacy vote-based approval flag
  voteId?: string; // Legacy vote reference

  // New fields
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  incomeLines: FinancialLineItem[];
  expenseLines: FinancialLineItem[];
  approvedBy?: string; // Second officer userId (Treasurer, President, or Comptroller)
  approvedAt?: string; // ISO timestamp
  rejectionReason?: string;
  chapterId?: string; // For future chapter rollups

  // Balance tracking (carried forward week-to-week per official form)
  beginningCheckingBalance: number; // Checking account balance at start of week (cents)
  endingCheckingBalance: number; // Computed: beginning + income - expenses (cents)
  savingsBalance?: number; // Savings account balance (cents, optional)

  // Bills due (from official form: "Bills To Be Paid within 30 days")
  billsDue: BillDue[];
}

interface FinancialLineItem {
  category: string;
  amount: number; // In cents
  description?: string;
  payee?: string; // Who was paid (from official form "Paid To")
  checkNumber?: string; // Check number used (from official form)
}

interface BillDue {
  description: string; // What the bill is for
  amount: number; // Amount in cents
  dueDate: string; // ISO date
}
```

### Predefined Categories

Based on official Oxford House Treasurer Training materials and state association documents:

**Income:**

- EES Collected (primary and dominant income source)
- Other Income

**Expense:**

- House Rent/Mortgage
- Utilities (electric, gas, water)
- Internet/Cable/Phone
- Household Supplies
- Maintenance/Repairs
- Food (optional — varies by house, decided by democratic vote)
- Chapter Dues ($2.25/resident/month typical)
- World Services ($50/month)
- Other Expenses

Users can also type custom category names. Categories are decided by each house through democratic vote per Oxford tradition.

**Removed from original spec after research:**

- ~~Insurance~~ — not a standard Oxford House expense
- ~~Late Fees~~ (income) — non-payment of EES is grounds for expulsion, not a fee
- ~~Donations~~ (income) — donations go to OHI, not individual houses

### All amounts in cents

Consistent with the rest of the app (Stripe convention). Display as `$XX.XX`.

### EES Refund Rule

Per Oxford House rules, unused EES **must** be returned to a departing member. It cannot be kept to cover unpaid bills or fines. The system should track this as a line item when a member departs, but enforcement is procedural, not automated.

---

## 4. Roles & Permissions

Uses existing `Officer` entity to determine role. No new auth claims needed.

**Research finding:** The Comptroller handles day-to-day financial operations (collecting rent, paying bills, maintaining the ledger). The Treasurer has overall financial responsibility and is a check signer. Any 2 of 3 authorized officers (President, Treasurer, Comptroller) must sign checks.

| Action                          | Comptroller | Treasurer | President | Member |
| ------------------------------- | :---------: | :-------: | :-------: | :----: |
| View approved records           |     Yes     |    Yes    |    Yes    |  Yes   |
| View draft/submitted records    |     Yes     |    Yes    |    Yes    |   No   |
| Create financial record         |     Yes     |    No     |    No     |   No   |
| Edit draft record               |     Yes     |    No     |    No     |   No   |
| Submit for approval             |     Yes     |    No     |    No     |   No   |
| Approve/reject submitted record |     No      |    Yes    |    Yes    |   No   |
| Resubmit rejected record        |     Yes     |    No     |    No     |   No   |

**Key change from original spec:** Comptroller creates and submits reports (they handle day-to-day). Treasurer OR President approves (matching the "any 2 of 3 signatures" requirement). This matches real Oxford House operations.

**Role resolution:** Query `houses/{houseId}/officers` for active officers. Match `officer.userId` against `currentUser.uid`.

**No officer assigned:** If no Comptroller is assigned, any admin can create records (fallback to prevent blocking). If no Treasurer or President is assigned, any admin can approve.

---

## 5. Screens

### 5.1 TreasuryDashboard

**Access:** From OxfordDashboard via a "Treasury" summary card.

**Layout:**

1. **Stat cards row** (3 cards):

   - Current Checking Balance (green positive / red negative)
   - Income This Period (current week)
   - Expenses This Period (current week)

2. **Current week status banner:**

   - No report → "No report for this week" + "Create Report" button (Comptroller only)
   - Draft → "Draft in progress" + "Continue Editing" button
   - Submitted → "Awaiting approval" (amber)
   - Approved → "Approved" + checkmark (green)
   - Rejected → "Rejected — needs revision" + "Edit" button (red)

3. **Record history** (FlatList):

   - Each row: period date, ending balance, status badge
   - Tap → navigates to FinancialRecordDetail
   - Sorted by period descending (most recent first)

4. **FAB** (Comptroller only): "+" to create new record → FinancialRecordForm

### 5.2 FinancialRecordForm

**Access:** FAB on TreasuryDashboard, or "Edit" on a draft/rejected record.

**Layout:**

1. **Period selector:** Week picker defaulting to current week. Shows Monday-Sunday date range.

2. **Beginning balance:** Pre-filled from previous week's ending balance. Editable for first-ever report or corrections. Shows both checking and savings (optional).

3. **EES pre-fill banner:** If EES records exist for the selected week, show: "EES data available for this week — total: $X. Pre-fill income?" Button populates the first income line with "EES Collected" category and the EES total.

4. **Income section:**

   - Header: "Cash & Receipts from Members" (matches official form language)
   - List of income line items, each with: category picker + amount input + optional description
   - "Add Income Line" button

5. **Expense section:**

   - Header: "Amount Paid Out" (matches official form language)
   - List of expense line items, each with: category picker + amount input + payee field + check number field + optional description
   - "Add Expense Line" button

6. **Bills due section:**

   - Header: "Bills To Be Paid (next 30 days)"
   - List of upcoming bills: description + amount + due date
   - "Add Bill" button

7. **Summary footer:**

   - Beginning Balance, + Income, - Expenses, = Ending Balance (auto-calculated, live)

8. **Action buttons:**
   - "Save Draft" — saves with status=draft, navigates back
   - "Submit for Approval" — saves with status=submitted, navigates back
   - Submit disabled if no lines entered

### 5.3 FinancialRecordDetail

**Access:** Tap a record row in TreasuryDashboard history list.

**Layout:**

1. **Header:** Period date range, status badge, submitted by name + date

2. **Balance summary:** Beginning Balance → Ending Balance

3. **Income breakdown:** Table with category, description, amount per line. Subtotal row.

4. **Expense breakdown:** Table with category, payee, check #, amount per line. Subtotal row.

5. **Bills due:** Table with description, amount, due date.

6. **Totals section:** Beginning Balance, Income, Expenses, Ending Balance (bold).

7. **Approval section** (Treasurer or President only, visible when status=submitted):

   - "Approve" button (green) → sets status=approved, records approvedBy + approvedAt
   - "Reject" button (red) → prompts for reason via Alert.prompt, sets status=rejected + rejectionReason

8. **Rejection info** (visible when status=rejected):

   - Shows rejectionReason
   - "Edit & Resubmit" button (Comptroller only) → opens FinancialRecordForm with existing data

9. **Share button** (all roles, approved records only):
   - Generates the official-format Weekly Financial Status Report via Share API
   - See Section 11 for format

---

## 6. Service Layer

### treasury.ts

```
getFinancialRecords(houseId, limit?)         → FinancialRecord[]
getFinancialRecord(houseId, recordId)        → FinancialRecord
createFinancialRecord(houseId, record)       → FinancialRecord
updateFinancialRecord(houseId, id, data)     → void
submitForApproval(houseId, id)               → void   // Sets status='submitted'
approveRecord(houseId, id, userId)           → void   // Sets status='approved', approvedBy, approvedAt
rejectRecord(houseId, id, reason)            → void   // Sets status='rejected', rejectionReason
getCurrentWeekRecord(houseId)                → FinancialRecord | null
getPreviousWeekRecord(houseId)               → FinancialRecord | null  // For beginning balance carry-forward
getEESIncomeForWeek(houseId, weekStart)      → number  // Sum of EES amounts for pre-fill
```

**Error handling:** try/catch with `logException()` + rethrow with user-friendly message. Same pattern as all other services.

**Role checking:** Done at the UI layer (button visibility), not in the service. Firestore security rules enforce server-side.

---

## 7. React Query Hooks

### treasuryQueries.ts

```
treasuryKeys = {
  all: ['treasury'],
  records: (houseId) => [...all, 'records', houseId],
  record: (houseId, id) => [...all, 'record', houseId, id],
  currentWeek: (houseId) => [...all, 'current-week', houseId],
  previousWeek: (houseId) => [...all, 'previous-week', houseId],
  summary: (houseId) => [...all, 'summary', houseId],
}

useFinancialRecords(houseId)          → paginated record list
useCurrentWeekRecord(houseId)         → current week's record or null
usePreviousWeekRecord(houseId)        → previous week's record (for balance carry-forward)
useTreasurySummary(houseId)           → { checkingBalance, periodIncome, periodExpenses }
useCreateFinancialRecord()            → mutation
useUpdateFinancialRecord()            → mutation
useSubmitForApproval()                → mutation
useApproveRecord()                    → mutation
useRejectRecord()                     → mutation
```

**staleTime:** 60 seconds (financial records don't change frequently).

**Cache invalidation:** All mutations invalidate `treasuryKeys.records(houseId)` and `treasuryKeys.currentWeek(houseId)`.

---

## 8. Firestore Security Rules

Add to `firebase/firestore.rules`:

```
match /houses/{houseId}/financial-records/{recordId} {
  allow read: if signedIn() && (
    isAdmin(houseId) || isHouseGuest(houseId)
  );
  allow create: if signedIn() && isAdmin(houseId);
  allow update: if signedIn() && isAdmin(houseId);
  allow delete: if false;  // Financial records are permanent (audit trail)
}
```

Financial records are never deleted (audit trail). All house members can read (Oxford transparency). Only admins can create and update. Finer role-based restrictions (Comptroller creates, Treasurer/President approves) are enforced at the UI layer.

---

## 9. Navigation

Add to `Routes` enum:

```
TreasuryDashboard = 'treasuryDashboard'
FinancialRecordForm = 'financialRecordForm'
FinancialRecordDetail = 'financialRecordDetail'
```

Add to `RootStackParamList`:

```
[Routes.TreasuryDashboard]: undefined;
[Routes.FinancialRecordForm]: { recordId?: string; houseId: string };
[Routes.FinancialRecordDetail]: { recordId: string; houseId: string };
```

### OxfordDashboard Integration

Add a "Treasury" summary card to OxfordDashboard showing:

- Current checking balance
- Status of current week's report
- Tap navigates to TreasuryDashboard

---

## 10. EES Integration

When creating a new FinancialRecordForm:

1. Query `getEESIncomeForWeek(houseId, weekStart)` for the selected period
2. If EES data exists, show a pre-fill banner: "EES collected this week: $X.XX — Add to income?"
3. Tapping "Add" inserts an income line: `{ category: 'EES Collected', amount: eesTotal }`
4. Comptroller can still manually adjust the amount or add additional lines

This creates a one-directional link: EES data feeds into financial records as income, but financial records don't modify EES data.

---

## 11. Weekly Financial Status Report (Shareable)

Matches the official Oxford House form format. Generated via the Share API.

```
═══════════════════════════════════════════════
  WEEKLY OXFORD HOUSE FINANCIAL STATUS REPORT
═══════════════════════════════════════════════

House:    [House Name]
Period:   [Mon Date] — [Sun Date]
Status:   Approved

─── BALANCES ──────────────────────────────────
Checking (beginning of week)    $X,XXX.XX
Savings                            $XXX.XX

─── CASH & RECEIPTS FROM MEMBERS ──────────────
EES Collected                   $X,XXX.XX
Other Income                       $XX.XX
                               ──────────
Total Receipts                  $X,XXX.XX

─── AMOUNT PAID OUT ───────────────────────────
House Rent        Payee Co.  #1234  $X,XXX.XX
Utilities         Power Co.  #1235    $XXX.XX
Household Supplies            Cash     $XX.XX
                               ──────────
Total Paid Out                 $X,XXX.XX

─── ENDING BALANCE ────────────────────────────
Checking (end of week)          $X,XXX.XX

─── BILLS TO BE PAID (next 30 days) ───────────
Electric bill     Due 05/15       $XXX.XX
Internet          Due 05/20        $XX.XX

Submitted by: [Name] on [Date]
Approved by:  [Name] on [Date]

═══════════════════════════════════════════════
Generated by Regroup (RATS)
```

---

## 12. Chapter-Ready Data Model

The `chapterId` field on FinancialRecord is:

- Optional (undefined for now)
- Set when a house is associated with a chapter (future feature)
- Enables `collectionGroup('financial-records').where('chapterId', '==', id)` queries for chapter rollups
- No UI, no logic, no migration — just the field reservation

Chapter dues are tracked as expense line items:

- Chapter Dues: ~$2.25/resident/month
- World Services: $50/month

When chapter features are built, the premium tier adds:

- Chapter entity with list of house IDs
- Chapter treasury dashboard aggregating across houses
- Chapter Treasurer role with cross-house read access
- Automated chapter dues tracking and reconciliation

---

## 13. Testing

| Test file                      | What it covers                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| TreasuryDashboard.test.tsx     | Stat cards render, record list, FAB visibility by role (Comptroller only), empty state, current week banner                             |
| FinancialRecordForm.test.tsx   | Add/remove line items, totals calculation, beginning balance carry-forward, EES pre-fill, check number/payee fields, save draft, submit |
| FinancialRecordDetail.test.tsx | Approval button visibility by role (Treasurer/President), approve/reject flow, share button, rejection info                             |

**Mock pattern:** Same as other Oxford tests — mock service/hooks, mock DataContext, mock RatsText/RatsButton.

---

## 14. Out of Scope (Deferred)

- Chapter-level rollups and reporting (premium tier, separate spec)
- Bank reconciliation automation (requires bank API integration)
- Monthly 3-person audit form (separate feature — uses financial records as input but has its own signing workflow)
- Payment deadline enforcement and automated reminders
- Receipt/proof-of-payment image attachments
- Historical trend charts (analytics dashboard, separate feature)
- PDF export (html-to-pdf excluded from iOS build; text share is sufficient)
- EES refund automation on member departure (procedural, not automated)

---

## 15. Research Sources

Design validated against:

- [WA Oxford House Treasurer Report form](http://wa.oxfordhouse.us/docs/TreasurersReport.pdf)
- [VA Treasurer Training Packet 2020](https://www.vaoxfordhouse.org/wp-content/uploads/Treasurer-Training-Packet-2020.pdf)
- [KS Officer Duties](https://oxfordhousekansas.org/wp-content/uploads/2021/01/officers-duties.pdf)
- [NC Monthly Audit Form](https://oxfordhousenc.com/wp-content/uploads/2020/03/monthly-audit-form.pdf)
- [Oxford House Manual](http://wa.oxfordhouse.us/docs/housemanual.pdf)
- [Oxford House EES Calculator](https://www.oxfordhouse.org/resources/ees-calculator)
- [Goose Creek embezzlement case (March 2026)](https://addictionrecoveryebulletin.org/oxford-house-treasurer-arrested-in-2-8k-embezzlement-case/)
