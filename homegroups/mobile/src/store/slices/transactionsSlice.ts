import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import {RootState} from '../types';
import auth from '@react-native-firebase/auth';
import {TreasuryModel} from '../../models/TreasuryModel';
import {Transaction, TransactionType} from '../../types/domain/treasury';
import {trackActivity} from '../../services/activityTracker';

// Define entity types
export interface TransactionEntity extends Transaction {
  id: string;
}

// Create entity adapter
const transactionsAdapter = createEntityAdapter<TransactionEntity>({
  sortComparer: (a, b) => {
    const dateA = a.createdAt
      ? a.createdAt instanceof Date
        ? a.createdAt
        : new Date(a.createdAt)
      : new Date(0);
    const dateB = b.createdAt
      ? b.createdAt instanceof Date
        ? b.createdAt
        : new Date(b.createdAt)
      : new Date(0);
    return dateB.getTime() - dateA.getTime();
  },
});

// Define state interface
export interface TransactionsState {
  transactions: ReturnType<typeof transactionsAdapter.getInitialState>;
  groupTransactionIds: Record<string, string[]>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastFetchedGroup: Record<string, number>;
}

// Initial state
const initialState: TransactionsState = {
  transactions: transactionsAdapter.getInitialState(),
  groupTransactionIds: {},
  status: 'idle',
  error: null,
  lastFetchedGroup: {},
};

// Constants
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

// Helper function to check if data is stale
const isDataStale = (lastFetched: number | undefined): boolean => {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > CACHE_TTL;
};

// Fetch transactions for a group
export const fetchGroupTransactions = createAsyncThunk<
  {groupId: string; transactions: Transaction[]},
  {groupId: string; limit?: number}, // Allow optional limit
  {state: RootState; rejectValue: string}
>(
  'transactions/fetchForGroup',
  async ({groupId, limit = 50}, {getState, rejectWithValue}) => {
    // TODO: Add caching logic
    try {
      const transactions = await TreasuryModel.getTransactions(groupId, limit);
      return {groupId, transactions};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch transactions');
    }
  },
);

// Add a new transaction
export const addTransaction = createAsyncThunk<
  Transaction, // Return the created transaction
  // Arguments expected from the form (excluding server-set fields like id, createdBy, createdAt)
  {
    groupId: string;
    type: TransactionType;
    amount: number;
    category: string;
    description?: string;
    /** ISO 8601 date string for the transaction date. When omitted the model uses the current timestamp. */
    transactionDate?: string;
  },
  {rejectValue: string}
>('transactions/addTransaction', async (transactionData, {rejectWithValue}) => {
  try {
    // The model handles setting createdBy and createdAt
    const newTransaction = await TreasuryModel.createTransaction(
      transactionData,
    );
    const currentUser = auth().currentUser;
    if (currentUser) {
      void trackActivity(currentUser.uid, 'group_action', newTransaction.groupId);
    }
    return newTransaction;
  } catch (error: any) {
    return rejectWithValue(error.message || 'Failed to add transaction');
  }
});

// Update a transaction
export const updateTransaction = createAsyncThunk<
  Transaction,
  {
    transactionId: string;
    groupId: string;
    updates: {
      type?: TransactionType;
      amount?: number;
      category?: string;
      description?: string;
    };
  },
  {rejectValue: string}
>(
  'transactions/update',
  async ({transactionId, groupId, updates}, {rejectWithValue}) => {
    try {
      const updatedTransaction = await TreasuryModel.updateTransaction(
        transactionId,
        updates,
      );
      return updatedTransaction;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update transaction');
    }
  },
);

// Delete a transaction
export const deleteTransaction = createAsyncThunk(
  'transactions/delete',
  async (
    {groupId, transactionId}: {groupId: string; transactionId: string},
    {rejectWithValue},
  ) => {
    try {
      await TreasuryModel.deleteTransaction(transactionId);
      const currentUser = auth().currentUser;
      if (currentUser) {
        void trackActivity(currentUser.uid, 'group_action', groupId);
      }
      return {groupId, transactionId};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to delete transaction');
    }
  },
);

const transactionsSlice = createSlice({
  name: 'transactions',
  initialState,
  reducers: {
    clearTransactionsError: state => {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      // Fetch Transactions
      .addCase(fetchGroupTransactions.pending, state => {
        state.status = 'loading';
      })
      .addCase(fetchGroupTransactions.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, transactions} = action.payload;
        transactionsAdapter.upsertMany(state.transactions, transactions);
        state.groupTransactionIds[groupId] = transactions.map(tx => tx.id);
        state.lastFetchedGroup[groupId] = Date.now();
        state.error = null;
      })
      .addCase(fetchGroupTransactions.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Add Transaction
      .addCase(addTransaction.pending, state => {
        state.status = 'loading';
      })
      .addCase(addTransaction.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const newTransaction = action.payload;
        transactionsAdapter.upsertOne(state.transactions, newTransaction);
        if (!state.groupTransactionIds[newTransaction.groupId]) {
          state.groupTransactionIds[newTransaction.groupId] = [];
        }
        state.groupTransactionIds[newTransaction.groupId].unshift(
          newTransaction.id,
        );
        state.error = null;
      })
      .addCase(addTransaction.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Update transaction
      .addCase(updateTransaction.pending, state => {
        state.status = 'loading';
      })
      .addCase(updateTransaction.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const updatedTransaction = action.payload;
        transactionsAdapter.upsertOne(state.transactions, updatedTransaction);
        state.error = null;
      })
      .addCase(updateTransaction.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Delete transaction
      .addCase(deleteTransaction.pending, state => {
        state.status = 'loading';
      })
      .addCase(deleteTransaction.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {groupId, transactionId} = action.payload;
        transactionsAdapter.removeOne(state.transactions, transactionId);
        if (state.groupTransactionIds[groupId]) {
          state.groupTransactionIds[groupId] = state.groupTransactionIds[
            groupId
          ].filter(id => id !== transactionId);
        }
        state.error = null;
      })
      .addCase(deleteTransaction.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

// Memoized selectors
const transactionsSelectors = transactionsAdapter.getSelectors<RootState>(
  state => state.transactions.transactions,
);

export const selectAllTransactions = transactionsSelectors.selectAll;
export const selectTransactionById = transactionsSelectors.selectById;

export const selectGroupTransactionIds = (state: RootState, groupId: string) =>
  state.transactions.groupTransactionIds[groupId];

export const selectGroupTransactions = createSelector(
  [transactionsSelectors.selectEntities, selectGroupTransactionIds],
  (entities, transactionIds) => {
    const ids = transactionIds || [];
    const transactions = ids
      .map(id => entities[id])
      .filter((tx): tx is TransactionEntity => tx !== undefined);
    return transactions;
  },
);

export const selectTransactionsStatus = (state: RootState) =>
  state.transactions.status;
export const selectTransactionsError = (state: RootState) =>
  state.transactions.error;
export const selectTransactionsUpdating = (state: RootState) =>
  state.transactions.status === 'loading';

export const {clearTransactionsError} = transactionsSlice.actions;
export default transactionsSlice.reducer;
