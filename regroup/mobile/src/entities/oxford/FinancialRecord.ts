export interface FinancialLineItem {
  category: string;
  amount: number;
  description?: string;
  payee?: string;
  checkNumber?: string;
}

export interface BillDue {
  description: string;
  amount: number;
  dueDate: string;
}

export type FinancialRecordStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected';

export interface FinancialRecord {
  id: string;
  houseId: string;
  period: string;
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  breakdown: FinancialLineItem[];
  submittedBy: string;
  submittedAt: string;
  approvedByVote: boolean;
  voteId?: string;
  status: FinancialRecordStatus;
  incomeLines: FinancialLineItem[];
  expenseLines: FinancialLineItem[];
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  chapterId?: string;
  beginningCheckingBalance: number;
  endingCheckingBalance: number;
  savingsBalance?: number;
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
