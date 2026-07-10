import {configureStore} from '@reduxjs/toolkit';
import transactionsReducer, {
  updateTransaction,
  deleteTransaction,
  fetchGroupTransactions,
} from '../transactionsSlice';

const mockUpdateTransaction = jest.fn();
const mockDeleteTransaction = jest.fn();
const mockGetTransactions = jest.fn();

jest.mock('../../../models/TreasuryModel', () => ({
  TreasuryModel: {
    createTransaction: jest.fn(),
    getTransactions: (...args: any[]) => mockGetTransactions(...args),
    updateTransaction: (...args: any[]) => mockUpdateTransaction(...args),
    deleteTransaction: (...args: any[]) => mockDeleteTransaction(...args),
    getTreasuryStats: jest.fn(),
  },
}));

jest.mock('../../../services/activityTracker', () => ({
  trackActivity: jest.fn(),
}));

jest.mock('@react-native-firebase/auth', () => {
  const mockAuth = {
    currentUser: {uid: 'test-uid'},
    onAuthStateChanged: jest.fn(() => jest.fn()),
  };
  return () => mockAuth;
});

function buildStore() {
  return configureStore({reducer: {transactions: transactionsReducer}});
}

function makeFakeTransaction(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'tx-abc',
    groupId: 'group-1',
    type: 'expense',
    amount: 40,
    category: 'Rent',
    description: 'March rent',
    createdBy: 'test-uid',
    createdAt: 1736899200000,
    ...overrides,
  };
}

describe('updateTransaction thunk', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls TreasuryModel.updateTransaction with transactionId and the updates object', async () => {
    mockUpdateTransaction.mockResolvedValue(makeFakeTransaction({amount: 55}));
    const store = buildStore();
    await store.dispatch(
      updateTransaction({
        transactionId: 'tx-abc',
        groupId: 'group-1',
        updates: {amount: 55},
      }),
    );

    expect(mockUpdateTransaction).toHaveBeenCalledWith('tx-abc', {
      amount: 55,
    });
  });

  it('upserts the updated transaction into the entity store on success', async () => {
    mockUpdateTransaction.mockResolvedValue(makeFakeTransaction({amount: 55}));
    const store = buildStore();
    await store.dispatch(
      updateTransaction({
        transactionId: 'tx-abc',
        groupId: 'group-1',
        updates: {amount: 55},
      }),
    );

    const state = store.getState().transactions;
    expect(state.status).toBe('succeeded');
    expect(state.transactions.entities['tx-abc']?.amount).toBe(55);
  });

  it('does not duplicate the groupTransactionIds bucket on update (only add/delete mutate it)', async () => {
    mockUpdateTransaction.mockResolvedValue(makeFakeTransaction({amount: 55}));
    const store = buildStore();
    await store.dispatch(
      updateTransaction({
        transactionId: 'tx-abc',
        groupId: 'group-1',
        updates: {amount: 55},
      }),
    );
    expect(
      store.getState().transactions.groupTransactionIds['group-1'],
    ).toBeUndefined();
  });

  it('sets status to failed and stores the error message when the model throws', async () => {
    mockUpdateTransaction.mockRejectedValue(new Error('Transaction not found'));
    const store = buildStore();
    const result = await store.dispatch(
      updateTransaction({
        transactionId: 'tx-missing',
        groupId: 'group-1',
        updates: {amount: 10},
      }),
    );

    expect(result.type).toBe('transactions/update/rejected');
    const state = store.getState().transactions;
    expect(state.status).toBe('failed');
    expect(state.error).toBe('Transaction not found');
  });

  it('falls back to a generic error message when the thrown error has no message', async () => {
    mockUpdateTransaction.mockRejectedValue({});
    const store = buildStore();
    const result = await store.dispatch(
      updateTransaction({
        transactionId: 'tx-abc',
        groupId: 'group-1',
        updates: {amount: 10},
      }),
    );
    expect((result as any).payload).toBe('Failed to update transaction');
  });
});

describe('deleteTransaction thunk', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls TreasuryModel.deleteTransaction with only the transactionId', async () => {
    mockDeleteTransaction.mockResolvedValue(undefined);
    const store = buildStore();
    await store.dispatch(
      deleteTransaction({groupId: 'group-1', transactionId: 'tx-abc'}),
    );
    expect(mockDeleteTransaction).toHaveBeenCalledWith('tx-abc');
  });

  it('removes the transaction from the entity store and its group bucket on success', async () => {
    mockGetTransactions.mockResolvedValue([makeFakeTransaction()]);
    mockDeleteTransaction.mockResolvedValue(undefined);
    const store = buildStore();

    await store.dispatch(fetchGroupTransactions({groupId: 'group-1'}));
    expect(
      store.getState().transactions.groupTransactionIds['group-1'],
    ).toContain('tx-abc');

    await store.dispatch(
      deleteTransaction({groupId: 'group-1', transactionId: 'tx-abc'}),
    );
    const state = store.getState().transactions;
    expect(state.transactions.entities['tx-abc']).toBeUndefined();
    expect(state.groupTransactionIds['group-1']).not.toContain('tx-abc');
  });

  it('sets status to failed and stores the error message when the model throws', async () => {
    mockDeleteTransaction.mockRejectedValue(new Error('Transaction not found'));
    const store = buildStore();
    const result = await store.dispatch(
      deleteTransaction({groupId: 'group-1', transactionId: 'tx-missing'}),
    );
    expect(result.type).toBe('transactions/delete/rejected');
    const state = store.getState().transactions;
    expect(state.status).toBe('failed');
    expect(state.error).toBe('Transaction not found');
  });

  it('is a no-op on groupTransactionIds for a group that was never fetched', async () => {
    mockDeleteTransaction.mockResolvedValue(undefined);
    const store = buildStore();
    await expect(
      store.dispatch(
        deleteTransaction({groupId: 'never-fetched', transactionId: 'tx-x'}),
      ),
    ).resolves.toMatchObject({type: 'transactions/delete/fulfilled'});
    expect(
      store.getState().transactions.groupTransactionIds['never-fetched'],
    ).toBeUndefined();
  });
});
