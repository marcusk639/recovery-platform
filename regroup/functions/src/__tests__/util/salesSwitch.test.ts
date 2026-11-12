const mockGet = jest.fn();
const mockDoc = jest.fn(() => ({ get: mockGet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));
const mockLoggerError = jest.fn();

jest.mock('firebase-admin', () => ({
  firestore: () => ({ collection: mockCollection }),
}));
jest.mock('firebase-functions', () => ({
  logger: { error: mockLoggerError, warn: jest.fn(), info: jest.fn() },
}));

import { isSalesOpen } from '../../util/salesSwitch';

const docIs = (data: Record<string, unknown> | undefined) =>
  mockGet.mockResolvedValue({ exists: data !== undefined, data: () => data });

describe('isSalesOpen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is open only when config/sales.open is true', async () => {
    docIs({ open: true });
    await expect(isSalesOpen()).resolves.toBe(true);
    expect(mockCollection).toHaveBeenCalledWith('config');
    expect(mockDoc).toHaveBeenCalledWith('sales');
  });

  it('is closed when the doc is missing', async () => {
    docIs(undefined);
    await expect(isSalesOpen()).resolves.toBe(false);
  });

  it('is closed when open is not a boolean', async () => {
    docIs({ open: 'true' });
    await expect(isSalesOpen()).resolves.toBe(false);
  });

  it('is closed when the field is missing', async () => {
    docIs({});
    await expect(isSalesOpen()).resolves.toBe(false);
  });

  it('is closed, and logs, when the read fails', async () => {
    mockGet.mockRejectedValue(new Error('unavailable'));
    await expect(isSalesOpen()).resolves.toBe(false);
    expect(mockLoggerError).toHaveBeenCalledWith(
      'salesSwitch.read_failed',
      expect.objectContaining({ error: 'unavailable' }),
    );
  });

  it('reads the doc on every call, so closing it takes effect at once', async () => {
    docIs({ open: true });
    await isSalesOpen();
    docIs({ open: false });
    await expect(isSalesOpen()).resolves.toBe(false);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
