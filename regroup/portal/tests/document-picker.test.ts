import { beforeEach, vi } from 'vitest';
import { errorCodes, isErrorWithCode, keepLocalCopy, pick, types } from '../src/adapter/document-picker';

const input = () => document.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  document.body.innerHTML = '';
  URL.createObjectURL = vi.fn(() => 'blob:http://localhost/abc');
  HTMLInputElement.prototype.click = vi.fn();
});

test('pick resolves with the chosen file', async () => {
  const picked = pick({ type: [types.pdf] });
  const file = new File(['%PDF'], 'lease.pdf', { type: 'application/pdf' });
  Object.defineProperty(input(), 'files', { value: [file] });
  input().dispatchEvent(new Event('change'));
  expect(await picked).toEqual([{ uri: 'blob:http://localhost/abc', name: 'lease.pdf', type: 'application/pdf', size: 4 }]);
  expect(input()).toBeNull();
});

test('cancelling rejects with OPERATION_CANCELED', async () => {
  const picked = pick({ type: [types.pdf] });
  input().dispatchEvent(new Event('cancel'));
  const error = await picked.catch((e: unknown) => e);
  expect(isErrorWithCode(error)).toBe(true);
  expect((error as { code: string }).code).toBe(errorCodes.OPERATION_CANCELED);
  expect(input()).toBeNull();
});

test('types.pdf and types.images become the accept attribute', () => {
  void pick({ type: [types.pdf, types.images] });
  expect(input().accept).toBe('application/pdf,image/*');
});

test('keepLocalCopy returns the shape the screen reads', async () => {
  const [copy] = await keepLocalCopy({ files: [{ uri: 'blob:x', fileName: 'a.pdf' }], destination: 'cachesDirectory' });
  expect(copy).toMatchObject({ status: 'success', localUri: 'blob:x' });
});

test('isErrorWithCode is false for other values', () => {
  expect(isErrorWithCode(new Error('x'))).toBe(false);
  expect(isErrorWithCode(null)).toBe(false);
});
