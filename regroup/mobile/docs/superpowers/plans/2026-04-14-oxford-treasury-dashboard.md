# Oxford Treasury Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a digital treasury management system for Oxford Houses — Comptrollers create weekly Financial Status Reports, Treasurers/Presidents approve them, all members can view approved reports.

**Architecture:** Extends the existing Oxford House feature set. Uses the `houses/{houseId}/financial-records/` subcollection (already exists). New treasury service + React Query hooks + 3 screens. Role-based permissions checked against existing Officer entity.

**Tech Stack:** React Native 0.72, TypeScript, Firestore, React Query, Formik-free (useState), Jest

**Spec:** `docs/superpowers/specs/2026-04-14-oxford-treasury-dashboard-design.md`

---

## File Structure

### New Files

```
src/entities/oxford/FinancialRecord.ts          # Updated entity + BillDue interface
src/services/treasury.ts                         # Firestore CRUD + approval + EES integration
src/services/treasuryReport.ts                   # Shareable text report generator
src/state/queries/treasuryQueries.ts             # React Query hooks
src/hooks/useTreasuryRole.ts                     # Role resolution hook (Comptroller/Treasurer/President)
src/screens/Treasury/TreasuryDashboard.tsx        # Summary + record list
src/screens/Treasury/FinancialRecordForm.tsx      # Create/edit weekly report
src/screens/Treasury/FinancialRecordDetail.tsx    # View + approve/reject
src/screens/Treasury/__tests__/TreasuryDashboard.test.tsx
src/screens/Treasury/__tests__/FinancialRecordForm.test.tsx
src/screens/Treasury/__tests__/FinancialRecordDetail.test.tsx
```

### Modified Files

```
src/navigation/types.ts                          # Add 3 Treasury routes
src/navigation/navigators.tsx                    # Register 3 Treasury screens
src/screens/Oxford/OxfordDashboard.tsx           # Add Treasury summary card
firebase/firestore.rules                         # Add financial-records subcollection rules
```

---

## Task 1: Update FinancialRecord Entity

**Files:**

- Modify: `src/entities/oxford/FinancialRecord.ts`

### Steps

- [ ] **Step 1: Rewrite FinancialRecord entity with all spec fields**

```ts
// src/entities/oxford/FinancialRecord.ts

export interface FinancialLineItem {
  category: string;
  amount: number; // In cents
  description?: string;
  payee?: string;
  checkNumber?: string;
}

export interface BillDue {
  description: string;
  amount: number; // In cents
  dueDate: string; // ISO date
}

export type FinancialRecordStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected';

export interface FinancialRecord {
  id: string;
  houseId: string;
  period: string; // YYYY-MM-DD (week start, Monday)
  totalIncome: number; // Computed sum of incomeLines (cents)
  totalExpenses: number; // Computed sum of expenseLines (cents)
  balance: number; // totalIncome - totalExpenses (cents)
  breakdown: FinancialLineItem[]; // Kept for backward compat
  submittedBy: string; // Comptroller userId
  submittedAt: string; // ISO timestamp
  approvedByVote: boolean; // Legacy
  voteId?: string; // Legacy

  status: FinancialRecordStatus;
  incomeLines: FinancialLineItem[];
  expenseLines: FinancialLineItem[];
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  chapterId?: string;

  beginningCheckingBalance: number; // cents
  endingCheckingBalance: number; // cents
  savingsBalance?: number; // cents
  billsDue: BillDue[];
}

export const INCOME_CATEGORIES = ['EES Collected', 'Other Income'] as const;

export const EXPENSE_CATEGORIES = [
  'House Rent/Mortgage',
  'Utilities',
  'Internet/Cable/Phone',
  'Household Supplies',
  'Maintenance/Repairs',
  'Food',
  'Chapter Dues',
  'World Services',
  'Other Expenses',
] as const;

export function createEmptyLineItem(): FinancialLineItem {
  return { category: '', amount: 0 };
}

export function createEmptyBillDue(): BillDue {
  return { description: '', amount: 0, dueDate: '' };
}

export function computeTotals(
  incomeLines: FinancialLineItem[],
  expenseLines: FinancialLineItem[],
  beginningBalance: number,
): {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  endingBalance: number;
} {
  const totalIncome = incomeLines.reduce((sum, l) => sum + l.amount, 0);
  const totalExpenses = expenseLines.reduce((sum, l) => sum + l.amount, 0);
  return {
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
    endingBalance: beginningBalance + totalIncome - totalExpenses,
  };
}
```

- [ ] **Step 2: Update the barrel export**

In `src/entities/oxford/index.ts`, ensure `FinancialRecord`, `FinancialLineItem`, `BillDue`, `FinancialRecordStatus`, `INCOME_CATEGORIES`, `EXPENSE_CATEGORIES`, `createEmptyLineItem`, `createEmptyBillDue`, `computeTotals` are all exported.

- [ ] **Step 3: Commit**

```bash
git add src/entities/oxford/FinancialRecord.ts src/entities/oxford/index.ts
git commit -m "feat(treasury): update FinancialRecord entity with status, approval, balance tracking, and bills due"
```

---

## Task 2: Treasury Role Resolution Hook

**Files:**

- Create: `src/hooks/useTreasuryRole.ts`

### Steps

- [ ] **Step 1: Create the role hook**

```ts
// src/hooks/useTreasuryRole.ts
import { useMemo } from 'react';
import { useOfficers } from '../state/queries/oxfordQueries';
import { useData } from '../context/DataContext';

export type TreasuryRole =
  | 'comptroller'
  | 'treasurer'
  | 'president'
  | 'admin'
  | 'member';

/**
 * Resolve the current user's treasury role for the given house.
 *
 * Priority: comptroller > treasurer > president > admin > member
 * Fallback: if no officers assigned, admins get elevated access.
 */
export function useTreasuryRole(houseId: string): {
  role: TreasuryRole;
  canCreate: boolean;
  canApprove: boolean;
  canViewDrafts: boolean;
  isLoading: boolean;
} {
  const { currentUser } = useData();
  const { data: officers, isLoading } = useOfficers(houseId, !!houseId);
  const uid = currentUser?.uid ?? '';

  return useMemo(() => {
    if (isLoading || !officers) {
      return {
        role: 'member' as const,
        canCreate: false,
        canApprove: false,
        canViewDrafts: false,
        isLoading,
      };
    }

    const active = officers.filter((o: any) => o.isActive);
    const myRoles = active
      .filter((o: any) => o.userId === uid)
      .map((o: any) => o.role);

    const isComptroller = myRoles.includes('comptroller');
    const isTreasurer = myRoles.includes('treasurer');
    const isPresident = myRoles.includes('president');

    // Fallback: if no comptroller assigned, any officer can create
    const hasComptroller = active.some((o: any) => o.role === 'comptroller');
    const hasApprover = active.some(
      (o: any) => o.role === 'treasurer' || o.role === 'president',
    );

    let role: TreasuryRole = 'member';
    if (isComptroller) role = 'comptroller';
    else if (isTreasurer) role = 'treasurer';
    else if (isPresident) role = 'president';

    const canCreate =
      isComptroller || (!hasComptroller && (isTreasurer || isPresident));
    const canApprove =
      isTreasurer || isPresident || (!hasApprover && isComptroller);
    const canViewDrafts = isComptroller || isTreasurer || isPresident;

    return { role, canCreate, canApprove, canViewDrafts, isLoading };
  }, [officers, uid, isLoading]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useTreasuryRole.ts
git commit -m "feat(treasury): add useTreasuryRole hook for officer-based permission resolution"
```

---

## Task 3: Treasury Service

**Files:**

- Create: `src/services/treasury.ts`

### Steps

- [ ] **Step 1: Create the treasury service**

```ts
// src/services/treasury.ts
import { firestore } from '../../firebase-setup';
import { FinancialRecord } from '../entities/oxford/FinancialRecord';
import { logException } from '../util/logging';

function recordsRef(houseId: string) {
  return firestore
    .collection('houses')
    .doc(houseId)
    .collection('financial-records');
}

export async function getFinancialRecords(
  houseId: string,
  limit = 20,
): Promise<FinancialRecord[]> {
  try {
    const snap = await recordsRef(houseId)
      .orderBy('period', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as FinancialRecord));
  } catch (error) {
    logException(error);
    throw new Error('Failed to load financial records');
  }
}

export async function getFinancialRecord(
  houseId: string,
  recordId: string,
): Promise<FinancialRecord | null> {
  try {
    const doc = await recordsRef(houseId).doc(recordId).get();
    return doc.exists
      ? ({ ...doc.data(), id: doc.id } as FinancialRecord)
      : null;
  } catch (error) {
    logException(error);
    throw new Error('Failed to load financial record');
  }
}

export async function createFinancialRecord(
  houseId: string,
  record: Omit<FinancialRecord, 'id'>,
): Promise<FinancialRecord> {
  try {
    const ref = recordsRef(houseId).doc();
    const doc: FinancialRecord = { ...record, id: ref.id };
    await ref.set(doc);
    return doc;
  } catch (error) {
    logException(error);
    throw new Error('Failed to create financial record');
  }
}

export async function updateFinancialRecord(
  houseId: string,
  recordId: string,
  data: Partial<FinancialRecord>,
): Promise<void> {
  try {
    await recordsRef(houseId).doc(recordId).update(data);
  } catch (error) {
    logException(error);
    throw new Error('Failed to update financial record');
  }
}

export async function submitForApproval(
  houseId: string,
  recordId: string,
): Promise<void> {
  try {
    await recordsRef(houseId).doc(recordId).update({
      status: 'submitted',
      submittedAt: new Date().toISOString(),
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to submit record for approval');
  }
}

export async function approveRecord(
  houseId: string,
  recordId: string,
  userId: string,
): Promise<void> {
  try {
    await recordsRef(houseId).doc(recordId).update({
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date().toISOString(),
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to approve financial record');
  }
}

export async function rejectRecord(
  houseId: string,
  recordId: string,
  reason: string,
): Promise<void> {
  try {
    await recordsRef(houseId).doc(recordId).update({
      status: 'rejected',
      rejectionReason: reason,
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to reject financial record');
  }
}

export async function getCurrentWeekRecord(
  houseId: string,
): Promise<FinancialRecord | null> {
  try {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const weekStart = monday.toISOString().slice(0, 10);

    const snap = await recordsRef(houseId)
      .where('period', '==', weekStart)
      .limit(1)
      .get();
    return snap.empty
      ? null
      : ({ ...snap.docs[0].data(), id: snap.docs[0].id } as FinancialRecord);
  } catch (error) {
    logException(error);
    throw new Error('Failed to load current week record');
  }
}

export async function getPreviousWeekRecord(
  houseId: string,
): Promise<FinancialRecord | null> {
  try {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) - 7);
    const weekStart = monday.toISOString().slice(0, 10);

    const snap = await recordsRef(houseId)
      .where('period', '==', weekStart)
      .limit(1)
      .get();
    return snap.empty
      ? null
      : ({ ...snap.docs[0].data(), id: snap.docs[0].id } as FinancialRecord);
  } catch (error) {
    logException(error);
    throw new Error('Failed to load previous week record');
  }
}

export async function getEESIncomeForWeek(
  houseId: string,
  weekStart: string,
): Promise<number> {
  try {
    const snap = await firestore
      .collection('ees-records')
      .where('houseId', '==', houseId)
      .where('weekStart', '==', weekStart)
      .get();
    return snap.docs.reduce((sum, d) => sum + (d.data().amount ?? 0), 0);
  } catch (error) {
    logException(error);
    return 0;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/treasury.ts
git commit -m "feat(treasury): add treasury Firestore service with CRUD, approval, and EES integration"
```

---

## Task 4: Treasury Report Generator

**Files:**

- Create: `src/services/treasuryReport.ts`

### Steps

- [ ] **Step 1: Create the report generator**

```ts
// src/services/treasuryReport.ts
import { Share, Platform } from 'react-native';
import { FinancialRecord } from '../entities/oxford/FinancialRecord';
import { logException } from '../util/logging';

function fmt(cents: number): string {
  const abs = Math.abs(cents);
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(abs / 100)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function periodRange(weekStart: string): string {
  const mon = new Date(weekStart);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return `${fmtDate(mon.toISOString())} — ${fmtDate(sun.toISOString())}`;
}

export function generateWeeklyReport(
  record: FinancialRecord,
  houseName: string,
  submitterName: string,
  approverName?: string,
): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════',
    '  WEEKLY OXFORD HOUSE FINANCIAL STATUS REPORT',
    '═══════════════════════════════════════════════',
    '',
    `House:    ${houseName}`,
    `Period:   ${periodRange(record.period)}`,
    `Status:   ${
      record.status.charAt(0).toUpperCase() + record.status.slice(1)
    }`,
    '',
    '─── BALANCES ──────────────────────────────────',
    `Checking (beginning of week)    ${fmt(record.beginningCheckingBalance)}`,
  ];

  if (record.savingsBalance != null) {
    lines.push(`Savings                         ${fmt(record.savingsBalance)}`);
  }

  lines.push('', '─── CASH & RECEIPTS FROM MEMBERS ──────────────');
  for (const line of record.incomeLines) {
    const desc = line.description ? ` (${line.description})` : '';
    lines.push(`${line.category}${desc}`.padEnd(36) + fmt(line.amount));
  }
  lines.push(''.padEnd(36) + '──────────');
  lines.push('Total Receipts'.padEnd(36) + fmt(record.totalIncome));

  lines.push('', '─── AMOUNT PAID OUT ───────────────────────────');
  for (const line of record.expenseLines) {
    const payee = line.payee ? `  ${line.payee}` : '';
    const check = line.checkNumber ? `  #${line.checkNumber}` : '';
    lines.push(
      `${line.category}${payee}${check}`.padEnd(36) + fmt(line.amount),
    );
  }
  lines.push(''.padEnd(36) + '──────────');
  lines.push('Total Paid Out'.padEnd(36) + fmt(record.totalExpenses));

  lines.push('', '─── ENDING BALANCE ────────────────────────────');
  lines.push(
    `Checking (end of week)`.padEnd(36) + fmt(record.endingCheckingBalance),
  );

  if (record.billsDue.length > 0) {
    lines.push('', '─── BILLS TO BE PAID (next 30 days) ───────────');
    for (const bill of record.billsDue) {
      lines.push(
        `${bill.description}`.padEnd(20) +
          `Due ${fmtDate(bill.dueDate)}`.padEnd(16) +
          fmt(bill.amount),
      );
    }
  }

  lines.push('');
  lines.push(
    `Submitted by: ${submitterName} on ${fmtDate(record.submittedAt)}`,
  );
  if (approverName && record.approvedAt) {
    lines.push(
      `Approved by:  ${approverName} on ${fmtDate(record.approvedAt)}`,
    );
  }
  lines.push('', '═══════════════════════════════════════════════');
  lines.push('Generated by Regroup (RATS)');

  return lines.join('\n');
}

export async function shareWeeklyReport(
  record: FinancialRecord,
  houseName: string,
  submitterName: string,
  approverName?: string,
): Promise<void> {
  const text = generateWeeklyReport(
    record,
    houseName,
    submitterName,
    approverName,
  );
  const subject = `Oxford House Financial Report — ${periodRange(
    record.period,
  )}`;
  try {
    await Share.share(
      { message: text, ...(Platform.OS === 'ios' ? { subject } : {}) },
      { subject, dialogTitle: 'Share Financial Report' },
    );
  } catch (error) {
    logException(error);
    throw new Error('Failed to share report');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/treasuryReport.ts
git commit -m "feat(treasury): add shareable Weekly Financial Status Report generator"
```

---

## Task 5: Treasury React Query Hooks

**Files:**

- Create: `src/state/queries/treasuryQueries.ts`

### Steps

- [ ] **Step 1: Create the query hooks**

```ts
// src/state/queries/treasuryQueries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as treasury from '../../services/treasury';
import type { FinancialRecord } from '../../entities/oxford/FinancialRecord';

export const treasuryKeys = {
  all: ['treasury'] as const,
  records: (houseId: string) =>
    [...treasuryKeys.all, 'records', houseId] as const,
  record: (houseId: string, id: string) =>
    [...treasuryKeys.all, 'record', houseId, id] as const,
  currentWeek: (houseId: string) =>
    [...treasuryKeys.all, 'current-week', houseId] as const,
  previousWeek: (houseId: string) =>
    [...treasuryKeys.all, 'previous-week', houseId] as const,
  eesIncome: (houseId: string, weekStart: string) =>
    [...treasuryKeys.all, 'ees', houseId, weekStart] as const,
};

export function useFinancialRecords(houseId: string, enabled = true) {
  return useQuery({
    queryKey: treasuryKeys.records(houseId),
    queryFn: () => treasury.getFinancialRecords(houseId),
    enabled: enabled && !!houseId,
    staleTime: 60000,
  });
}

export function useCurrentWeekRecord(houseId: string, enabled = true) {
  return useQuery({
    queryKey: treasuryKeys.currentWeek(houseId),
    queryFn: () => treasury.getCurrentWeekRecord(houseId),
    enabled: enabled && !!houseId,
    staleTime: 60000,
  });
}

export function usePreviousWeekRecord(houseId: string, enabled = true) {
  return useQuery({
    queryKey: treasuryKeys.previousWeek(houseId),
    queryFn: () => treasury.getPreviousWeekRecord(houseId),
    enabled: enabled && !!houseId,
    staleTime: 60000,
  });
}

export function useEESIncomeForWeek(
  houseId: string,
  weekStart: string,
  enabled = true,
) {
  return useQuery({
    queryKey: treasuryKeys.eesIncome(houseId, weekStart),
    queryFn: () => treasury.getEESIncomeForWeek(houseId, weekStart),
    enabled: enabled && !!houseId && !!weekStart,
    staleTime: 60000,
  });
}

function useInvalidateTreasury() {
  const qc = useQueryClient();
  return (houseId: string) => {
    qc.invalidateQueries({ queryKey: treasuryKeys.records(houseId) });
    qc.invalidateQueries({ queryKey: treasuryKeys.currentWeek(houseId) });
  };
}

export function useCreateFinancialRecord() {
  const invalidate = useInvalidateTreasury();
  return useMutation({
    mutationFn: ({
      houseId,
      record,
    }: {
      houseId: string;
      record: Omit<FinancialRecord, 'id'>;
    }) => treasury.createFinancialRecord(houseId, record),
    onSuccess: result => invalidate(result.houseId),
  });
}

export function useUpdateFinancialRecord() {
  const invalidate = useInvalidateTreasury();
  return useMutation({
    mutationFn: ({
      houseId,
      recordId,
      data,
    }: {
      houseId: string;
      recordId: string;
      data: Partial<FinancialRecord>;
    }) => treasury.updateFinancialRecord(houseId, recordId, data),
    onSuccess: (_data, { houseId }) => invalidate(houseId),
  });
}

export function useSubmitForApproval() {
  const invalidate = useInvalidateTreasury();
  return useMutation({
    mutationFn: ({
      houseId,
      recordId,
    }: {
      houseId: string;
      recordId: string;
    }) => treasury.submitForApproval(houseId, recordId),
    onSuccess: (_data, { houseId }) => invalidate(houseId),
  });
}

export function useApproveRecord() {
  const invalidate = useInvalidateTreasury();
  return useMutation({
    mutationFn: ({
      houseId,
      recordId,
      userId,
    }: {
      houseId: string;
      recordId: string;
      userId: string;
    }) => treasury.approveRecord(houseId, recordId, userId),
    onSuccess: (_data, { houseId }) => invalidate(houseId),
  });
}

export function useRejectRecord() {
  const invalidate = useInvalidateTreasury();
  return useMutation({
    mutationFn: ({
      houseId,
      recordId,
      reason,
    }: {
      houseId: string;
      recordId: string;
      reason: string;
    }) => treasury.rejectRecord(houseId, recordId, reason),
    onSuccess: (_data, { houseId }) => invalidate(houseId),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/state/queries/treasuryQueries.ts
git commit -m "feat(treasury): add React Query hooks for financial records"
```

---

## Task 6: Register Treasury Routes

**Files:**

- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/navigators.tsx`

### Steps

- [ ] **Step 1: Add routes to Routes enum**

Add to `src/navigation/types.ts` Routes enum (after Oxford routes):

```ts
// Treasury Routes
TreasuryDashboard = 'treasuryDashboard',
FinancialRecordForm = 'financialRecordForm',
FinancialRecordDetail = 'financialRecordDetail',
```

- [ ] **Step 2: Add param types to RootStackParamList**

```ts
// Treasury screens
[Routes.TreasuryDashboard]: undefined;
[Routes.FinancialRecordForm]: { recordId?: string; houseId: string };
[Routes.FinancialRecordDetail]: { recordId: string; houseId: string };
```

- [ ] **Step 3: Register screens in navigators.tsx**

Add imports and screen registrations (after Oxford screens section). Note: the screen components don't exist yet — they'll be created in Tasks 7-9. Register them with lazy imports or add after screens are built.

```tsx
import TreasuryDashboard from '../screens/Treasury/TreasuryDashboard';
import FinancialRecordForm from '../screens/Treasury/FinancialRecordForm';
import FinancialRecordDetail from '../screens/Treasury/FinancialRecordDetail';

// In RootStack.Group:
<RootStack.Screen name={Routes.TreasuryDashboard} component={TreasuryDashboard} />
<RootStack.Screen name={Routes.FinancialRecordForm} component={FinancialRecordForm} />
<RootStack.Screen name={Routes.FinancialRecordDetail} component={FinancialRecordDetail} />
```

- [ ] **Step 4: Commit**

```bash
git add src/navigation/types.ts src/navigation/navigators.tsx
git commit -m "feat(treasury): register treasury routes and screens"
```

---

## Task 7: Treasury Dashboard Screen + Tests

**Files:**

- Create: `src/screens/Treasury/TreasuryDashboard.tsx`
- Create: `src/screens/Treasury/__tests__/TreasuryDashboard.test.tsx`

### Steps

- [ ] **Step 1: Write failing tests**

Tests should cover: loading state, stat cards rendering with balance/income/expenses, current week status banner (no report / draft / submitted / approved / rejected), FAB visibility for Comptroller only, record history list, navigation to detail on row tap.

Mock `useTreasuryRole`, `useCurrentWeekRecord`, `useFinancialRecords`, `useData`. Use the same mock pattern as other Oxford tests (mock `rats-text`, `rats-button`, `screen-header`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/screens/Treasury/__tests__/TreasuryDashboard.test.tsx --no-coverage`

Expected: FAIL — module not found

- [ ] **Step 3: Implement the screen**

Layout follows the spec (Section 5.1):

1. Three stat cards: Current Checking Balance, Income This Period, Expenses This Period
2. Current week status banner with context-appropriate button (Create/Edit/View)
3. FlatList of record history rows (period, ending balance, status badge)
4. FAB visible only when `canCreate` from `useTreasuryRole`

Use `useData()` for `currentHouse`, `useCurrentWeekRecord(houseId)` for the banner, `useFinancialRecords(houseId)` for the list. Navigate with `Routes.FinancialRecordForm` and `Routes.FinancialRecordDetail`.

Follow the visual style of `PaymentDashboard` (stat cards + list + FAB).

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/screens/Treasury/
git commit -m "feat(treasury): add TreasuryDashboard screen with stat cards, status banner, and record list"
```

---

## Task 8: Financial Record Form Screen + Tests

**Files:**

- Create: `src/screens/Treasury/FinancialRecordForm.tsx`
- Create: `src/screens/Treasury/__tests__/FinancialRecordForm.test.tsx`

### Steps

- [ ] **Step 1: Write failing tests**

Tests should cover: renders period selector, add/remove income lines, add/remove expense lines, auto-calculated totals (beginning + income - expenses = ending), EES pre-fill banner when data available, payee and check number fields on expense lines, Save Draft button saves with status='draft', Submit button saves with status='submitted', loads existing record data when `recordId` param provided.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement the form**

Layout follows spec (Section 5.2). Use `useState` for form state (not Formik). Key implementation details:

- Period selector: compute current week Monday, display Monday–Sunday range
- Beginning balance: from `usePreviousWeekRecord` → `endingCheckingBalance`, editable
- EES pre-fill: from `useEESIncomeForWeek(houseId, weekStart)`, banner + "Add" button
- Income lines: dynamic list with category picker (predefined `INCOME_CATEGORIES` + custom), amount input, description
- Expense lines: same + payee field + check number field, using `EXPENSE_CATEGORIES`
- Bills due: dynamic list with description, amount, due date
- Summary footer: live-computed via `computeTotals()` from entity
- Save Draft: calls `useCreateFinancialRecord` or `useUpdateFinancialRecord` with status='draft'
- Submit: same but status='submitted'

When `route.params.recordId` is provided, load existing record via `getFinancialRecord` and pre-populate form.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/screens/Treasury/FinancialRecordForm.tsx src/screens/Treasury/__tests__/FinancialRecordForm.test.tsx
git commit -m "feat(treasury): add FinancialRecordForm with income/expense lines, EES pre-fill, and balance tracking"
```

---

## Task 9: Financial Record Detail Screen + Tests

**Files:**

- Create: `src/screens/Treasury/FinancialRecordDetail.tsx`
- Create: `src/screens/Treasury/__tests__/FinancialRecordDetail.test.tsx`

### Steps

- [ ] **Step 1: Write failing tests**

Tests should cover: renders period and status badge, renders income breakdown table, renders expense breakdown with payee and check number, renders bills due section, Approve button visible for Treasurer/President when status=submitted, Reject button visible with reason prompt, approval updates status + approvedBy, rejection info shown when status=rejected, Edit & Resubmit button visible for Comptroller on rejected record, Share button visible only on approved records.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement the screen**

Layout follows spec (Section 5.3). Load record via `route.params.recordId` and `route.params.houseId`. Use `useTreasuryRole` for permission checks.

Key sections:

1. Header with period range + status badge
2. Balance summary (beginning → ending)
3. Income table (category, description, amount, subtotal)
4. Expense table (category, payee, check #, amount, subtotal)
5. Bills due table
6. Totals (beginning, +income, -expenses, =ending)
7. Approval buttons (Treasurer/President, when status=submitted)
8. Rejection info + Edit button (Comptroller, when status=rejected)
9. Share button (approved records only) → `shareWeeklyReport()`

For approval: `useApproveRecord` mutation. For rejection: `Alert.prompt` for reason, then `useRejectRecord` mutation.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/screens/Treasury/FinancialRecordDetail.tsx src/screens/Treasury/__tests__/FinancialRecordDetail.test.tsx
git commit -m "feat(treasury): add FinancialRecordDetail with approval workflow and shareable report"
```

---

## Task 10: Wire Treasury into Oxford Dashboard

**Files:**

- Modify: `src/screens/Oxford/OxfordDashboard.tsx`

### Steps

- [ ] **Step 1: Add Treasury summary card**

Add a "Treasury" card to the OxfordDashboard (follow the existing card pattern for Officers, Meetings, EES). The card should show:

- Title: "Treasury"
- Icon: `money-check-alt` or `file-invoice-dollar`
- Current checking balance from `useCurrentWeekRecord`
- Status badge for current week's report
- Tap navigates to `Routes.TreasuryDashboard`

Place it after the Officers card and before the EES Transactions card.

- [ ] **Step 2: Commit**

```bash
git add src/screens/Oxford/OxfordDashboard.tsx
git commit -m "feat(treasury): add Treasury summary card to OxfordDashboard"
```

---

## Task 11: Firestore Security Rules

**Files:**

- Modify: `firebase/firestore.rules`

### Steps

- [ ] **Step 1: Add financial-records subcollection rules**

Add inside the `match /houses/{houseId}` block (near existing subcollection rules for chat, officers, votes):

```
    // Financial records — permanent audit trail, all members can read
    match /financial-records/{recordId} {
      allow read: if signedIn() && (
        isAdmin(houseId) || isHouseGuest(houseId)
      );
      allow create: if signedIn() && isAdmin(houseId);
      allow update: if signedIn() && isAdmin(houseId);
      allow delete: if false;
    }
```

- [ ] **Step 2: Commit**

```bash
git add firebase/firestore.rules
git commit -m "feat(treasury): add Firestore security rules for financial-records subcollection"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Entity (Task 1), Role hook (Task 2), Service (Task 3), Report generator (Task 4), Query hooks (Task 5), Routes (Task 6), Dashboard screen (Task 7), Form screen (Task 8), Detail screen (Task 9), Oxford Dashboard integration (Task 10), Security rules (Task 11). All 15 spec sections covered.
- [x] **Placeholder scan:** Tasks 7-9 describe test expectations and implementation requirements rather than providing full screen code — intentional for screens that involve significant UI layout decisions. All code for entity, service, hooks, and report generator is complete.
- [x] **Type consistency:** `FinancialRecord` interface, `FinancialLineItem`, `BillDue`, `FinancialRecordStatus` used consistently across entity → service → queries → screens. `TreasuryRole` type consistent between hook and screen usage. `computeTotals()` return type matches form footer needs.
