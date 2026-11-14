/**
 * markPaymentResolvedOffline asks the server (#238). The payments rules refuse
 * every client update, so the old direct write to payments/<id> always failed.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import { markPaymentResolvedOffline } from '../payments';

beforeEach(() => {
  resetOpLog();
});

describe('markPaymentResolvedOffline', () => {
  it('calls the markPaymentResolvedOffline callable with the house and the payment', async () => {
    await markPaymentResolvedOffline('house-1', 'pay-abc-123');
    expect(getOpLog()).toEqual([
      {
        op: 'call',
        path: 'markPaymentResolvedOffline',
        data: { houseId: 'house-1', paymentId: 'pay-abc-123' },
      },
    ]);
  });

  it('writes nothing to Firestore itself', async () => {
    seedDoc('payments/pay-abc-123', { status: 'failed', amount: 50000 });
    await markPaymentResolvedOffline('house-1', 'pay-abc-123');
    expect(getOpLog().filter((e) => e.op !== 'call')).toEqual([]);
    expect(readDoc('payments/pay-abc-123')).toEqual({ status: 'failed', amount: 50000 });
  });

  it("passes the server's refusal on", async () => {
    failNext('call', new Error('permission-denied'), 'markPaymentResolvedOffline');
    await expect(markPaymentResolvedOffline('house-1', 'pay-abc-123')).rejects.toThrow(
      'permission-denied',
    );
  });

  it('targets the given payment', async () => {
    await markPaymentResolvedOffline('house-2', 'pay-xyz');
    expect(getOpLog()[0].data).toEqual({ houseId: 'house-2', paymentId: 'pay-xyz' });
  });
});
