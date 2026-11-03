/**
 * The receipt's date. PaymentRow passes '' when a payment's createdAt is
 * missing or unparseable, and new Date('') printed "Invalid Date" on the
 * receipt and in the share subject.
 */
import { Share } from 'react-native';
import { generateReceiptText, ReceiptData, shareReceipt } from '../receiptService';

jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

const receipt = (date: string): ReceiptData => ({
  paymentId: 'pay_1234567890abcdef',
  guestName: 'Resident',
  houseName: 'House',
  amountInCents: 15000,
  method: 'Card',
  date,
  status: 'succeeded',
});

describe('the receipt date', () => {
  it('is the long date for an ISO string', () => {
    expect(generateReceiptText(receipt('2026-03-05T12:00:00.000Z'))).toContain(
      'Date:      March 5, 2026',
    );
  });

  it.each(['', 'not-a-date'])('says it is unavailable instead of "Invalid Date" for %j', (date) => {
    const text = generateReceiptText(receipt(date));

    expect(text).toContain('Date:      Date unavailable');
    expect(text).not.toContain('Invalid Date');
  });

  it('is unavailable in the share subject too, never "Invalid Date"', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);

    await shareReceipt(receipt(''));

    const [content] = share.mock.calls[0] as [{ message: string; subject?: string }];
    expect(content.message).not.toContain('Invalid Date');
    expect(content.subject ?? '').not.toContain('Invalid Date');
    share.mockRestore();
  });
});
