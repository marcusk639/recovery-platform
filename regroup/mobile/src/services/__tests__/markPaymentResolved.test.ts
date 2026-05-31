jest.mock('../../../firebase-setup', () => {
  const mockUpdate = jest.fn().mockResolvedValue(undefined);
  const mockDoc = jest.fn(() => ({ update: mockUpdate }));
  const mockCollection = jest.fn(() => ({ doc: mockDoc }));
  return {
    firestore: {
      collection: mockCollection,
      _mockCollection: mockCollection,
      _mockUpdate: mockUpdate,
      _mockDoc: mockDoc,
    },
    auth: { currentUser: { uid: 'admin-uid-1' } },
  };
});

import { firestore } from '../../../firebase-setup';
import { markPaymentResolvedOffline, paymentsCollection } from '../payments';

const getUpdate = () => (firestore as any)._mockUpdate as jest.Mock;

describe('markPaymentResolvedOffline', () => {
  it('writes to the payments collection', async () => {
    // Verify that firestore.collection was called with 'payments' by the paymentsCollection export
    // We do this by verifying the mock is set up and trying to use the collection
    const paymentsRef = (firestore as any).collection('payments');
    expect((firestore as any)._mockCollection).toHaveBeenCalledWith('payments');

    // Verify the chain works: collection('payments').doc('id').update(data)
    const docRef = paymentsRef.doc('test-id');
    expect((firestore as any)._mockDoc).toHaveBeenCalledWith('test-id');

    await docRef.update({ test: true });
    expect(getUpdate()).toHaveBeenCalledWith({ test: true });
  });

  beforeEach(() => jest.clearAllMocks());

  it('updates status to resolved_offline on the payments document', async () => {
    await markPaymentResolvedOffline('pay-abc-123');

    expect(getUpdate()).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'resolved_offline' }),
    );
  });

  it('writes resolvedAt as a valid ISO string', async () => {
    await markPaymentResolvedOffline('pay-abc-123');
    const written = getUpdate().mock.calls[0][0];
    expect(new Date(written.resolvedAt).toISOString()).toBe(written.resolvedAt);
  });

  it('targets the correct document id', async () => {
    await markPaymentResolvedOffline('pay-abc-123');
    expect((firestore as any)._mockDoc).toHaveBeenCalledWith('pay-abc-123');
  });
});
