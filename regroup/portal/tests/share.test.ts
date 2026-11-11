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
      // Raw bytes: readAsText would drop a byte-order mark.
      reader.onload = () => {
        const bytes = new Uint8Array(reader.result as ArrayBuffer);
        resolve(Array.from(bytes.slice(0, 3)).map((n) => n.toString(16)).join(' ') + '|' + new TextDecoder().decode(bytes.slice(3)));
      };
      reader.readAsArrayBuffer(b);
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
  // A byte-order mark, so Excel reads UTF-8 ("Manual Payment — Cash").
  // EF BB BF is the UTF-8 byte-order mark, so Excel reads "—" and accents.
  expect(await clicked[0].text).toBe('ef bb bf|a,b\n1,2');
  // Revoked a moment later: some browsers drop a download revoked at once.
  expect(revoked).toEqual([]);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect(revoked).toEqual(['blob:portal/1']);
});

test('names comma-separated text without an extension as .csv', () => {
  expect(fileNameFor('Payment History Export', 'Date,Amount\n2026-11-01,50.00')).toBe(
    'payment-history-export.csv',
  );
});

test('names other text as .txt', () => {
  expect(fileNameFor('Receipt', 'Thank you for your payment of $50.00.')).toBe('receipt.txt');
  // Lines with different numbers of commas aren't a table.
  expect(fileNameFor('Log', 'a,b\nc')).toBe('log.txt');
});

test('counts only commas outside quotes, and a lone header is still a table (review)', () => {
  expect(fileNameFor('Payment History Export', 'Date,Guest,Amount\n2026-11-01,"Doe, Jane",50.00')).toBe(
    'payment-history-export.csv',
  );
  expect(fileNameFor('Payment History Export', 'Date,Guest,Amount ($),Status,Description')).toBe(
    'payment-history-export.csv',
  );
});

test("a share of a native file path refuses, so the caller's alert shows (review)", async () => {
  await expect(Share.share({ url: 'file:///data/export.pdf' })).rejects.toThrow(/isn't available on the web/);
  expect(clicked).toHaveLength(0);
});

test('names the file from dialogTitle, never subject, when there is no title (review)', async () => {
  await Share.share({ message: 'Receipt text' }, { dialogTitle: 'Rent receipt', subject: 'Receipt for Jane Doe' });
  expect(clicked[0].name).toBe('rent-receipt.txt');
});

test('falls back to export when there is no usable title', () => {
  expect(fileNameFor(undefined, 'plain')).toBe('export.txt');
  expect(fileNameFor('  ', 'a,b\n1,2')).toBe('export.csv');
});
