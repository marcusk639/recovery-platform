export type EESTransactionType = 'payment' | 'adjustment' | 'refund';
export type EESTransactionStatus = 'pending' | 'paid' | 'overdue';

/**
 * EESTransaction — represents an Equal Expense Share record.
 *
 * Note: The EES service (ees.ts) writes `paid: boolean` + `weekStart: string`
 * to Firestore. This interface supports both the service's shape and the
 * richer shape used by oxford/index.ts for dashboard display.
 */
export interface EESTransaction {
  id: string;
  houseId: string;
  guestId: string;
  amount: number;
  /** Week start date — matches the `weekStart` field written by ees.ts */
  period?: string; // YYYY-MM-DD (week start)
  weekStart?: string; // Alias used by ees.ts service
  type?: EESTransactionType;
  status?: EESTransactionStatus;
  /** Boolean flag written by ees.ts — true when paid */
  paid?: boolean;
  paidAt?: string;
  notes?: string;
  createdAt?: string;
}
