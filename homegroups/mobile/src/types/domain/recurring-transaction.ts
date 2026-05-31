export type RecurrenceFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringTransaction {
  id: string;
  groupId: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  frequency: RecurrenceFrequency;
  nextDate: string; // ISO string
  dayOfMonth?: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
