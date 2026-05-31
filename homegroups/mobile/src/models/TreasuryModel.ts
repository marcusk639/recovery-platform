import {
  Transaction,
  TreasuryStats,
  TransactionType,
  FinancialReport,
  IncomeCategory,
  ExpenseCategory,
} from '../types/domain/treasury';
import {FirestoreDocument, TreasuryOverviewDocument} from '../types/schema';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {TransactionDocument} from '../types/schema';

/**
 * Treasury model for managing financial data
 */
export class TreasuryModel {
  /**
   * Convert a Firestore transaction document to a Transaction object
   */
  static fromFirestore(
    doc: FirestoreDocument<TransactionDocument>,
  ): Transaction {
    const data = doc.data();
    return {
      id: doc.id,
      type: data.type,
      amount: data.amount,
      category: data.category,
      description: data.description,
      createdBy: data.createdBy,
      groupId: data.groupId,
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
      updatedBy: data.updatedBy,
    };
  }

  /**
   * Convert a Transaction object to a Firestore document
   */
  static toFirestore(
    transaction: Partial<Transaction>,
  ): Partial<TransactionDocument> {
    const firestoreData: Partial<TransactionDocument> = {};

    if (transaction.id !== undefined) firestoreData.id = transaction.id;
    if (transaction.type !== undefined) firestoreData.type = transaction.type;
    if (transaction.amount !== undefined)
      firestoreData.amount = transaction.amount;
    if (transaction.category !== undefined)
      firestoreData.category = transaction.category;
    if (transaction.description !== undefined)
      firestoreData.description = transaction.description;
    if (transaction.createdBy !== undefined)
      firestoreData.createdBy = transaction.createdBy;
    if (transaction.groupId !== undefined)
      firestoreData.groupId = transaction.groupId;

    return firestoreData;
  }

  /**
   * Get transactions for a group
   */
  static async getTransactions(
    groupId: string,
    limit: number = 50,
  ): Promise<Transaction[]> {
    try {
      const transactionsSnapshot = await firestore()
        .collection('transactions')
        .where('groupId', '==', groupId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      return transactionsSnapshot.docs.map(doc =>
        TreasuryModel.fromFirestore({
          id: doc.id,
          data: () => doc.data() as TransactionDocument,
        }),
      );
    } catch (error) {
      console.error('Error getting transactions:', error);
      throw error;
    }
  }

  /**
   * Get treasury stats for a group
   */
  static async getTreasuryStats(groupId: string): Promise<TreasuryStats> {
    try {
      // Get the treasury overview document
      const overviewDoc = await firestore()
        .collection('treasury_overviews')
        .doc(groupId)
        .get();

      if (!overviewDoc.exists) {
        // No overview yet — the onTransactionWrite Cloud Function trigger will
        // create it when the first transaction is written.  Return a computed
        // default without attempting a client-side write (which would be blocked
        // by Firestore security rules: allow create: if false).
        return TreasuryModel.defaultTreasuryStats(groupId);
      }

      const data = overviewDoc.data() as TreasuryOverviewDocument;

      // Check if we need to reset monthly stats
      if (
        TreasuryModel.shouldResetMonthlyStats(data.lastMonthReset?.toDate())
      ) {
        return TreasuryModel.resetMonthlyStats(data);
      }

      return {
        balance: data.balance,
        monthlyIncome: data.monthlyIncome,
        monthlyExpenses: data.monthlyExpenses,
        prudentReserve: data.prudentReserve,
        availableFunds: data.balance - data.prudentReserve,
        lastUpdated: data.lastUpdated.toDate(),
        groupId: data.groupId,
        lastMonthReset: data.lastMonthReset?.toDate(),
      };
    } catch (error) {
      console.error('Error getting treasury stats:', error);
      throw error;
    }
  }

  /**
   * Check if we should reset monthly stats
   */
  private static shouldResetMonthlyStats(lastReset?: Date): boolean {
    if (!lastReset) return true;

    const now = new Date();
    // Reset if we're in a different month than the last reset
    return (
      now.getMonth() !== lastReset.getMonth() ||
      now.getFullYear() !== lastReset.getFullYear()
    );
  }

  /**
   * Return TreasuryStats with monthly counters zeroed for a new calendar month.
   *
   * The actual persisted reset of monthlyIncome / monthlyExpenses /
   * lastMonthReset in treasury_overviews is intentionally NOT done here.
   * Those fields are owned by server-side Cloud Functions (the
   * onTransactionWrite trigger and the scheduledRecurringTransactions
   * function) and cannot be updated from the client (security rule:
   * allow update only for prudentReserve / availableFunds / lastUpdated).
   * The UI receives accurate zeroed values; the persisted document will be
   * corrected the next time any transaction is written for this group.
   */
  private static resetMonthlyStats(
    data: TreasuryOverviewDocument,
  ): TreasuryStats {
    const now = new Date();
    return {
      balance: data.balance,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      prudentReserve: data.prudentReserve,
      availableFunds: data.balance - data.prudentReserve,
      lastUpdated: now,
      groupId: data.groupId,
      lastMonthReset: now,
    };
  }

  /**
   * Create a transaction
   *
   * @param transactionData  Partial transaction fields. When `transactionData`
   *   contains a `transactionDate` string (ISO 8601) that date is used as the
   *   Firestore `createdAt` timestamp so the user's chosen date is persisted.
   *   Otherwise the current server time is used.
   */
  static async createTransaction(
    transactionData: Partial<Transaction> & {transactionDate?: string},
  ): Promise<Transaction> {
    try {
      const currentUser = auth().currentUser;

      if (!currentUser) {
        throw new Error('No authenticated user');
      }

      const docRef = firestore().collection('transactions').doc();

      // Resolve the effective date: use the caller-supplied date when provided,
      // otherwise fall back to the current time.
      const effectiveDate =
        transactionData.transactionDate
          ? new Date(transactionData.transactionDate)
          : new Date();

      // Strip the non-domain field before building the Firestore document so
      // it does not bleed into the stored data or the returned Transaction.
      const {transactionDate: _ignored, ...domainData} = transactionData;

      const now = effectiveDate;
      const defaultTransaction: Partial<Transaction> = {
        createdBy: currentUser.uid,
        createdAt: now,
        id: docRef.id,
      };

      const newTransaction = {...defaultTransaction, ...domainData};

      if (!newTransaction.type) {
        throw new Error('Transaction type is required');
      }

      if (!newTransaction.amount || newTransaction.amount <= 0) {
        throw new Error('Valid transaction amount is required');
      }

      if (!newTransaction.category) {
        throw new Error('Transaction category is required');
      }

      if (!newTransaction.groupId) {
        throw new Error('Group ID is required');
      }

      // Create the transaction in the top-level collection.
      // Treasury stats (treasury_overviews) are updated automatically by the
      // onTransactionWrite Cloud Function trigger — no client-side stats write
      // is needed here.
      await docRef.set({
        ...TreasuryModel.toFirestore(newTransaction),
        createdAt: firestore.Timestamp.fromDate(now),
      });

      const createdTransaction = await docRef.get();
      return TreasuryModel.fromFirestore({
        id: createdTransaction.id,
        data: () => createdTransaction.data() as TransactionDocument,
      });
    } catch (error) {
      console.error('Error creating transaction:', error);
      throw error;
    }
  }

  /**
   * Update a transaction
   */
  static async updateTransaction(
    transactionId: string,
    transactionData: Partial<Transaction>,
  ): Promise<Transaction> {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        throw new Error('No authenticated user');
      }

      const transactionRef = firestore()
        .collection('transactions')
        .doc(transactionId);

      const transactionDoc = await transactionRef.get();

      if (!transactionDoc.exists) {
        throw new Error('Transaction not found');
      }

      const currentData = transactionDoc.data() as TransactionDocument;
      const groupId = currentData.groupId;

      // Treasury stats (treasury_overviews) are updated automatically by the
      // onTransactionWrite Cloud Function trigger when the transaction document
      // is written below — no client-side stats adjustment is needed here.

      // Build edit history entry recording what changed
      const now = firestore.Timestamp.now();
      const previousValues: {
        amount?: number;
        description?: string;
        category?: string;
        type?: 'income' | 'expense';
      } = {};
      if (
        transactionData.amount !== undefined &&
        transactionData.amount !== currentData.amount
      ) {
        previousValues.amount = currentData.amount;
      }
      if (
        transactionData.description !== undefined &&
        transactionData.description !== currentData.description
      ) {
        previousValues.description = currentData.description;
      }
      if (
        transactionData.category !== undefined &&
        transactionData.category !== currentData.category
      ) {
        previousValues.category = currentData.category;
      }
      if (
        transactionData.type !== undefined &&
        transactionData.type !== currentData.type
      ) {
        previousValues.type = currentData.type;
      }

      const editHistoryUpdate =
        Object.keys(previousValues).length > 0
          ? {
              editHistory: firestore.FieldValue.arrayUnion({
                editedAt: now,
                editedBy: currentUser.uid,
                previousValues,
              }),
            }
          : {};

      await transactionRef.update({
        ...TreasuryModel.toFirestore(transactionData),
        updatedAt: now,
        updatedBy: currentUser.uid,
        ...editHistoryUpdate,
      });

      const updatedDoc = await transactionRef.get();
      return TreasuryModel.fromFirestore({
        id: updatedDoc.id,
        data: () => updatedDoc.data() as TransactionDocument,
      });
    } catch (error) {
      console.error('Error updating transaction:', error);
      throw error;
    }
  }

  /**
   * Delete a transaction
   */
  static async deleteTransaction(transactionId: string): Promise<void> {
    try {
      const transactionRef = firestore()
        .collection('transactions')
        .doc(transactionId);

      const transactionDoc = await transactionRef.get();

      if (!transactionDoc.exists) {
        throw new Error('Transaction not found');
      }

      // Delete the transaction.  Treasury stats (treasury_overviews) are
      // updated automatically by the onTransactionWrite Cloud Function trigger
      // *after* the delete succeeds in Firestore — no client-side stats
      // reversal is needed here, and the old ordering bug (reversing stats
      // before the delete, which could corrupt the balance on a failed delete)
      // is eliminated.
      await transactionRef.delete();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      throw error;
    }
  }

  /**
   * Update the prudent reserve amount for a group
   */
  static async updatePrudentReserve(
    groupId: string,
    newReserve: number,
  ): Promise<void> {
    try {
      if (newReserve < 0 || newReserve > 10000) {
        throw new Error('Prudent reserve must be between $0 and $10,000');
      }

      const overviewRef = firestore()
        .collection('treasury_overviews')
        .doc(groupId);

      const overviewDoc = await overviewRef.get();

      if (!overviewDoc.exists) {
        // The treasury_overviews document is created by the onTransactionWrite
        // Cloud Function trigger on the first transaction.  Client-side creates
        // are blocked by security rules (allow create: if false), so we cannot
        // initialise it here.  The caller should add the first transaction
        // before setting a prudent reserve.
        throw new Error(
          'Treasury overview not initialised for this group yet. ' +
            'Add a transaction first.',
        );
      }

      const currentBalance = (overviewDoc.data() as TreasuryOverviewDocument).balance ?? 0;
      await overviewRef.update({
        prudentReserve: newReserve,
        availableFunds: currentBalance - newReserve,
        lastUpdated: firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating prudent reserve:', error);
      throw error;
    }
  }

  /**
   * Return a zeroed-out TreasuryStats object for a group that has no
   * treasury_overviews document yet.  This is a pure computation — it does
   * NOT write to Firestore.  The onTransactionWrite Cloud Function trigger
   * creates the overview document automatically when the first transaction is
   * written, so there is no need for the client to bootstrap it.
   */
  private static defaultTreasuryStats(
    groupId: string,
    prudentReserve: number = 600,
  ): TreasuryStats {
    const now = new Date();
    return {
      balance: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      prudentReserve,
      availableFunds: -prudentReserve,
      lastUpdated: now,
      groupId,
      lastMonthReset: now,
    };
  }

  /**
   * Get transactions for a specific date range
   */
  static async getTransactionsForDateRange(
    groupId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Transaction[]> {
    try {
      const transactionsSnapshot = await firestore()
        .collection('transactions')
        .where('groupId', '==', groupId)
        .where('createdAt', '>=', firestore.Timestamp.fromDate(startDate))
        .where('createdAt', '<=', firestore.Timestamp.fromDate(endDate))
        .orderBy('createdAt', 'desc')
        .get();

      return transactionsSnapshot.docs.map(doc =>
        TreasuryModel.fromFirestore({
          id: doc.id,
          data: () => doc.data() as TransactionDocument,
        }),
      );
    } catch (error) {
      console.error('Error getting transactions for date range:', error);
      throw error;
    }
  }

  /**
   * Get all transactions before a specific date (for calculating starting balance)
   */
  static async getTransactionsBeforeDate(
    groupId: string,
    date: Date,
  ): Promise<Transaction[]> {
    try {
      const transactionsSnapshot = await firestore()
        .collection('transactions')
        .where('groupId', '==', groupId)
        .where('createdAt', '<', firestore.Timestamp.fromDate(date))
        .orderBy('createdAt', 'asc')
        .get();

      return transactionsSnapshot.docs.map(doc =>
        TreasuryModel.fromFirestore({
          id: doc.id,
          data: () => doc.data() as TransactionDocument,
        }),
      );
    } catch (error) {
      console.error('Error getting transactions before date:', error);
      throw error;
    }
  }

  /**
   * Calculate the balance from a list of transactions
   */
  private static calculateBalanceFromTransactions(
    transactions: Transaction[],
  ): number {
    return transactions.reduce((balance, tx) => {
      if (tx.type === 'income') {
        return balance + tx.amount;
      } else {
        return balance - tx.amount;
      }
    }, 0);
  }

  /**
   * Group transactions by category
   */
  private static groupTransactionsByCategory(
    transactions: Transaction[],
    type: TransactionType,
  ): {[key: string]: number} {
    const filtered = transactions.filter(tx => tx.type === type);
    return filtered.reduce((acc, tx) => {
      const category = tx.category;
      acc[category] = (acc[category] || 0) + tx.amount;
      return acc;
    }, {} as {[key: string]: number});
  }

  /**
   * Generate a financial report for a date range
   */
  static async generateReport(
    groupId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Omit<FinancialReport, 'id' | 'createdBy' | 'createdAt'>> {
    try {
      // Get current treasury stats for prudent reserve
      const treasuryStats = await TreasuryModel.getTreasuryStats(groupId);

      // Get transactions before start date to calculate starting balance
      const transactionsBeforeStart =
        await TreasuryModel.getTransactionsBeforeDate(groupId, startDate);
      const startingBalance = TreasuryModel.calculateBalanceFromTransactions(
        transactionsBeforeStart,
      );

      // Get transactions within the date range
      const transactions = await TreasuryModel.getTransactionsForDateRange(
        groupId,
        startDate,
        endDate,
      );

      // Calculate totals
      const totalIncome = transactions
        .filter(tx => tx.type === 'income')
        .reduce((sum, tx) => sum + tx.amount, 0);

      const totalExpenses = transactions
        .filter(tx => tx.type === 'expense')
        .reduce((sum, tx) => sum + tx.amount, 0);

      const endingBalance = startingBalance + totalIncome - totalExpenses;

      // Group by category
      const incomeByCategory = TreasuryModel.groupTransactionsByCategory(
        transactions,
        'income',
      ) as {[key in IncomeCategory]?: number};

      const expensesByCategory = TreasuryModel.groupTransactionsByCategory(
        transactions,
        'expense',
      ) as {[key in ExpenseCategory]?: number};

      // Calculate excess funds
      const excessFunds = endingBalance - treasuryStats.prudentReserve;

      return {
        groupId,
        startDate,
        endDate,
        startingBalance,
        endingBalance,
        totalIncome,
        totalExpenses,
        incomeByCategory,
        expensesByCategory,
        transactions,
        prudentReserve: treasuryStats.prudentReserve,
        excessFunds: excessFunds > 0 ? excessFunds : undefined,
      };
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }

  /**
   * Save a financial report to Firestore
   */
  static async saveReport(
    report: Omit<FinancialReport, 'id' | 'createdAt'>,
  ): Promise<FinancialReport> {
    try {
      const currentUser = auth().currentUser;

      if (!currentUser) {
        throw new Error('No authenticated user');
      }

      const now = new Date();
      const docRef = firestore().collection('financial_reports').doc();

      const reportData = {
        ...report,
        id: docRef.id,
        createdBy: report.createdBy || currentUser.uid,
        createdAt: firestore.Timestamp.fromDate(now),
        startDate: firestore.Timestamp.fromDate(report.startDate),
        endDate: firestore.Timestamp.fromDate(report.endDate),
        // Convert transactions to a storable format (without circular refs)
        transactions: report.transactions.map(tx => ({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          category: tx.category,
          description: tx.description,
          createdBy: tx.createdBy,
          groupId: tx.groupId,
          createdAt: tx.createdAt
            ? firestore.Timestamp.fromDate(tx.createdAt)
            : null,
        })),
      };

      await docRef.set(reportData);

      return {
        ...report,
        id: docRef.id,
        createdBy: report.createdBy || currentUser.uid,
        createdAt: now,
      };
    } catch (error) {
      console.error('Error saving report:', error);
      throw error;
    }
  }

  /**
   * Get saved reports for a group
   */
  static async getSavedReports(
    groupId: string,
    limit: number = 12,
  ): Promise<FinancialReport[]> {
    try {
      const reportsSnapshot = await firestore()
        .collection('financial_reports')
        .where('groupId', '==', groupId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      return reportsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          groupId: data.groupId,
          startDate: data.startDate.toDate(),
          endDate: data.endDate.toDate(),
          startingBalance: data.startingBalance,
          endingBalance: data.endingBalance,
          totalIncome: data.totalIncome,
          totalExpenses: data.totalExpenses,
          incomeByCategory: data.incomeByCategory,
          expensesByCategory: data.expensesByCategory,
          transactions: data.transactions.map((tx: any) => ({
            ...tx,
            createdAt: tx.createdAt?.toDate(),
          })),
          prudentReserve: data.prudentReserve,
          excessFunds: data.excessFunds,
          createdBy: data.createdBy,
          createdAt: data.createdAt.toDate(),
          approvedBy: data.approvedBy,
          approvedAt: data.approvedAt?.toDate(),
          notes: data.notes,
        };
      });
    } catch (error) {
      console.error('Error getting saved reports:', error);
      throw error;
    }
  }
}
