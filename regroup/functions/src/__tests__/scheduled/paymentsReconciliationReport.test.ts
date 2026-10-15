import { fakeEmptyCollection } from './helpers/fakeApiFirestore';

const mockCountGet = jest.fn();
const mockSelectGet = jest.fn();
const mockWhere = jest.fn();

jest.mock('../../api/firestore', () => ({
  paymentsCollection: { where: (...a: unknown[]) => mockWhere(...a) },
  rentCollectionAttemptCollection: fakeEmptyCollection(),
  guestCollection: fakeEmptyCollection(),
}));

jest.mock('firebase-functions', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { logger } from 'firebase-functions';
import { reportPaymentsNeedingReconciliation } from '../../scheduled/rentAttempts';

describe('reportPaymentsNeedingReconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue({
      where: mockWhere,
      count: () => ({ get: mockCountGet }),
      select: () => ({ limit: () => ({ get: mockSelectGet }) }),
    });
  });

  it('queries the flag the webhook actually writes', async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 0 }) });

    await reportPaymentsNeedingReconciliation();

    expect(mockWhere).toHaveBeenCalledWith(
      'needsManualReconciliation',
      '==',
      true,
    );
  });

  it('excludes records an operator has already resolved', async () => {
    // Nothing clears this flag today. Without the second clause the daily
    // sweep alarms on the same document forever, which is how an alert
    // becomes noise operators filter out.
    mockCountGet.mockResolvedValue({ data: () => ({ count: 0 }) });

    await reportPaymentsNeedingReconciliation();

    expect(mockWhere).toHaveBeenCalledWith('reconciledAt', '==', null);
  });

  it('returns 0 and stays quiet when nothing is flagged', async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 0 }) });

    await expect(reportPaymentsNeedingReconciliation()).resolves.toBe(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs at error with ids only, so the existing alert fires', async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 2 }) });
    mockSelectGet.mockResolvedValue({
      size: 1,
      docs: [
        {
          id: 'pi_1',
          data: () => ({ guestId: 'g1', refusedReason: 'unsupported_currency' }),
        },
      ],
    });

    await expect(reportPaymentsNeedingReconciliation()).resolves.toBe(2);
    expect(logger.error).toHaveBeenCalledWith(
      'rentAttempts: payments need manual reconciliation',
      expect.objectContaining({
        count: 2,
        sampled: 1,
        payments: [
          {
            paymentId: 'pi_1',
            guestId: 'g1',
            refusedReason: 'unsupported_currency',
          },
        ],
      }),
    );
  });

  it('logs no resident names or amounts', async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 1 }) });
    mockSelectGet.mockResolvedValue({
      size: 1,
      docs: [
        {
          id: 'pi_1',
          data: () => ({
            guestId: 'g1',
            refusedReason: 'unsupported_currency',
            firstName: 'Jane',
            amountMinorUnits: 50000,
          }),
        },
      ],
    });

    await reportPaymentsNeedingReconciliation();

    const payload = JSON.stringify((logger.error as jest.Mock).mock.calls[0][1]);
    expect(payload).not.toContain('Jane');
    expect(payload).not.toContain('50000');
  });
});
