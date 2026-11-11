import { afterEach, beforeEach, vi } from 'vitest';
import { Share, fileNameFor } from '../src/adapter/share';

// Share.share on react-native-web is navigator.share, which most desktop
// browsers lack, so the phone's CSV exports did nothing. The portal downloads.
let clicked: { name: string; text: Promise<string> }[] = [];
const revoked: string[] = [];

beforeEach(() => {
  clicked = [];
  revoked.length = 0;
  let blob: Blob | undefined;
  (URL as any).createObjectURL = vi.fn((b: Blob) => {
    blob = b;
    return 'blob:portal/1';
  });
  (URL as any).revokeObjectURL = vi.fn((u: string) => revoked.push(u));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const b = blob!;
    const text = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(b);
    });
    clicked.push({ name: this.download, text });
  });
});

afterEach(() => vi.restoreAllMocks());

test('downloads the message under the title when it has an extension', async () => {
  const result = await Share.share({ message: 'a,b\n1,2', title: 'payments-2026-11-10.csv' });
  expect(result).toEqual({ action: 'sharedAction' });
  expect(clicked).toHaveLength(1);
  expect(clicked[0].name).toBe('payments-2026-11-10.csv');
  expect(await clicked[0].text).toBe('a,b\n1,2');
  expect(revoked).toEqual(['blob:portal/1']);
});

test('names comma-separated text without an extension as .csv', () => {
  expect(fileNameFor('Payment History Export', 'Date,Amount\n2026-11-01,50.00')).toBe(
    'payment-history-export.csv',
  );
});

test('names other text as .txt', () => {
  expect(fileNameFor('Receipt', 'Thank you for your payment of $50.00.')).toBe('receipt.txt');
  // One comma-separated line isn't a table.
  expect(fileNameFor('Note', 'Hello, world')).toBe('note.txt');
  // Lines with different numbers of commas aren't a table either.
  expect(fileNameFor('Log', 'a,b\nc')).toBe('log.txt');
});

test('falls back to export when there is no usable title', () => {
  expect(fileNameFor(undefined, 'plain')).toBe('export.txt');
  expect(fileNameFor('  ', 'a,b\n1,2')).toBe('export.csv');
});
