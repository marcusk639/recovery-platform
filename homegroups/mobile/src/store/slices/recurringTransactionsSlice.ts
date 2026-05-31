// mobile/src/store/slices/recurringTransactionsSlice.ts
import {
  createSlice,
  createAsyncThunk,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {RootState} from '../types';
import {
  RecurringTransaction,
  RecurrenceFrequency,
} from '../../types/domain/recurring-transaction';

const adapter = createEntityAdapter<RecurringTransaction>({
  sortComparer: (a, b) => a.nextDate.localeCompare(b.nextDate),
});

export interface RecurringTransactionsState {
  entities: ReturnType<typeof adapter.getInitialState>;
  groupIds: Record<string, string[]>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: RecurringTransactionsState = {
  entities: adapter.getInitialState(),
  groupIds: {},
  status: 'idle',
  error: null,
};

function docToRecurring(doc: any, id: string): RecurringTransaction {
  const d = doc;
  return {
    id,
    groupId: d.groupId,
    type: d.type,
    amount: d.amount,
    description: d.description,
    category: d.category,
    frequency: d.frequency as RecurrenceFrequency,
    nextDate: d.nextDate.toDate().toISOString(),
    dayOfMonth: d.dayOfMonth,
    isActive: d.isActive,
    createdBy: d.createdBy,
    createdAt: d.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
    updatedAt: d.updatedAt?.toDate().toISOString() ?? new Date().toISOString(),
  };
}

export const fetchRecurringTransactions = createAsyncThunk(
  'recurringTransactions/fetch',
  async (groupId: string, {rejectWithValue}) => {
    try {
      const snap = await firestore()
        .collection('recurring_transactions')
        .where('groupId', '==', groupId)
        .orderBy('nextDate', 'asc')
        .get();
      const items = snap.docs.map(doc => docToRecurring(doc.data(), doc.id));
      return {groupId, items};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to fetch recurring transactions',
      );
    }
  },
);

export const createRecurringTransaction = createAsyncThunk(
  'recurringTransactions/create',
  async (
    params: {
      groupId: string;
      type: 'income' | 'expense';
      amount: number;
      description: string;
      category: string;
      frequency: RecurrenceFrequency;
      startDate: Date;
    },
    {rejectWithValue},
  ) => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      const ref = firestore().collection('recurring_transactions').doc();
      const now = firestore.Timestamp.now();
      await ref.set({
        id: ref.id,
        groupId: params.groupId,
        type: params.type,
        amount: params.amount,
        description: params.description,
        category: params.category,
        frequency: params.frequency,
        nextDate: firestore.Timestamp.fromDate(params.startDate),
        isActive: true,
        createdBy: currentUser.uid,
        createdAt: now,
        updatedAt: now,
      });

      return docToRecurring(
        {
          ...params,
          nextDate: {toDate: () => params.startDate},
          isActive: true,
          createdAt: {toDate: () => new Date()},
          updatedAt: {toDate: () => new Date()},
        },
        ref.id,
      );
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to create recurring transaction',
      );
    }
  },
);

export const toggleRecurringActive = createAsyncThunk(
  'recurringTransactions/toggleActive',
  async (
    {id, isActive}: {id: string; isActive: boolean},
    {rejectWithValue},
  ) => {
    try {
      await firestore()
        .collection('recurring_transactions')
        .doc(id)
        .update({isActive, updatedAt: firestore.Timestamp.now()});
      return {id, isActive};
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to update recurring transaction',
      );
    }
  },
);

export const deleteRecurringTransaction = createAsyncThunk(
  'recurringTransactions/delete',
  async (id: string, {rejectWithValue}) => {
    try {
      await firestore().collection('recurring_transactions').doc(id).delete();
      return id;
    } catch (error: any) {
      return rejectWithValue(
        error.message || 'Failed to delete recurring transaction',
      );
    }
  },
);

const recurringTransactionsSlice = createSlice({
  name: 'recurringTransactions',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchRecurringTransactions.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchRecurringTransactions.fulfilled, (state, action) => {
        state.status = 'succeeded';
        adapter.upsertMany(state.entities, action.payload.items);
        state.groupIds[action.payload.groupId] = action.payload.items.map(
          i => i.id,
        );
      })
      .addCase(fetchRecurringTransactions.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(createRecurringTransaction.fulfilled, (state, action) => {
        adapter.upsertOne(state.entities, action.payload);
        const g = action.payload.groupId;
        state.groupIds[g] = [...(state.groupIds[g] || []), action.payload.id];
      })
      .addCase(toggleRecurringActive.fulfilled, (state, action) => {
        adapter.updateOne(state.entities, {
          id: action.payload.id,
          changes: {isActive: action.payload.isActive},
        });
      })
      .addCase(deleteRecurringTransaction.fulfilled, (state, action) => {
        adapter.removeOne(state.entities, action.payload);
      });
  },
});

export default recurringTransactionsSlice.reducer;

const selectors = adapter.getSelectors(
  (state: RootState) => state.recurringTransactions.entities,
);

export const selectRecurringByGroup = createSelector(
  [
    (state: RootState) => state.recurringTransactions.groupIds,
    selectors.selectEntities,
    (_: RootState, groupId: string) => groupId,
  ],
  (groupIds, entities, groupId) =>
    (groupIds[groupId] || [])
      .map(id => entities[id])
      .filter((r): r is RecurringTransaction => r !== undefined),
);

export const selectRecurringStatus = (state: RootState) =>
  state.recurringTransactions.status;
