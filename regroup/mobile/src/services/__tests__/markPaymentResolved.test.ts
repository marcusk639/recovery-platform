/**
 * markPaymentResolvedOffline asks the resolveFailedPaymentOffline callable
 * (#238). payments is server-written only (firestore.rules), so the client
 * update this used to make was always refused and "Mark Resolved" always failed.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

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
  it('asks the resolveFailedPaymentOffline callable for the payment', async () => {
    await markPaymentResolvedOffline('pi_abc123');

    expect(getOpLog()).toEqual([
      { op: 'call', path: 'resolveFailedPaymentOffline', data: { paymentId: 'pi_abc123' } },
    ]);
  });

  it('writes nothing to Firestore itself, which the rules refuse', async () => {
    seedDoc('payments/pi_abc123', { status: 'failed', amount: 50000 });

    await markPaymentResolvedOffline('pi_abc123');

    expect(getOpLog().filter(entry => entry.op !== 'call')).toEqual([]);
    expect(readDoc('payments/pi_abc123')).toEqual({ status: 'failed', amount: 50000 });
  });

  it('rejects when the server refuses, so the banner can say so', async () => {
    failNext('call', Object.assign(new Error('permission-denied'), { code: 'permission-denied' }));

    await expect(markPaymentResolvedOffline('pi_abc123')).rejects.toThrow('permission-denied');
  });

  it('sends only the payment id', async () => {
    await markPaymentResolvedOffline('pay-manual-1');

    expect(getOpLog()[0].data).toEqual({ paymentId: 'pay-manual-1' });
  });
});
