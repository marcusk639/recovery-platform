/**
 * Types specific to treasury management
 */

/**
 * Treasury Types
 */

export type TransactionType = 'income' | 'expense';
export type TransactionCategory =
  | '7th Tradition'
  | 'Literature Sales'
  | 'Event Income'
  | 'Other Income'
  | 'Rent'
  | 'Literature Purchase'
  | 'Refreshments'
  | 'Events'
  | 'Contributions'
  | 'Other Expense';

export interface EditHistoryEntry {
  editedAt: Date;
  editedBy: string;
  previousValues: Partial<
    Pick<Transaction, 'amount' | 'description' | 'category' | 'type'>
  >;
}

export interface Transaction {
  id: string;
  groupId: string;
  type: TransactionType;
  amount: number;
  description: string;
  category: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
  updatedBy?: string;
  editHistory?: EditHistoryEntry[];
}

export interface TreasuryStats {
  balance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  prudentReserve: number;
  availableFunds: number;
  lastUpdated: Date;
  groupId: string;
  lastMonthReset?: Date;
}

export type IncomeCategory =
  | '7th Tradition'
  | 'Literature Sales'
  | 'Event Income'
  | 'Group Contributions'
  | 'Other Income';

export type ExpenseCategory =
  | 'Rent'
  | 'Literature'
  | 'Refreshments'
  | 'Events'
  | 'Contributions to Service Bodies'
  | 'Area Contribution'
  | 'Region Contribution'
  | 'World Service'
  | 'Supplies'
  | 'Printing'
  | 'Insurance'
  | 'Other Expenses';

export interface FinancialReport {
  id: string;
  groupId: string;
  startDate: Date;
  endDate: Date;
  startingBalance: number;
  endingBalance: number;
  totalIncome: number;
  totalExpenses: number;
  incomeByCategory: {[key in IncomeCategory]?: number};
  expensesByCategory: {[key in ExpenseCategory]?: number};
  transactions: Transaction[];
  prudentReserve: number;
  excessFunds?: number;
  createdBy: string;
  createdAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  notes?: string;
}

export interface ContributionPlan {
  id: string;
  groupId: string;
  totalAmount: number;
  areaAmount: number;
  regionalAmount: number;
  worldAmount: number;
  otherAmount: number;
  otherDescription?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
