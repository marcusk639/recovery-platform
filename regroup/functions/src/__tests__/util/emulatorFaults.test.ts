// src/__tests__/util/emulatorFaults.test.ts
//
// The e2e fault switch (launch P5 Task 12, BILL-008) must be impossible to
// trigger outside the Functions emulator running demo-regroup-e2e: there it
// never reads Firestore, whatever the e2e/faults doc says.

const mockGet = jest.fn();
const mockDoc = jest.fn(() => ({ get: mockGet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock('firebase-admin', () => ({
  firestore: () => ({ collection: mockCollection }),
}));
jest.mock('firebase-functions', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { isE2EEmulator, isEmulatorFaultOn } from '../../util/emulatorFaults';

const E2E_ENV = { FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'demo-regroup-e2e' };

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue({ exists: true, data: () => ({ tierCatalogUnavailable: true }) });
});

describe('isE2EEmulator', () => {
  it('is true only in the Functions emulator running demo-regroup-e2e', () => {
    expect(isE2EEmulator(E2E_ENV)).toBe(true);
  });

  it.each([
    ['production', { GCLOUD_PROJECT: 'phoenix-cleanhouse' }],
    [
      'production with FUNCTIONS_EMULATOR set',
      { FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'phoenix-cleanhouse' },
    ],
    ['staging in the emulator', { FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'regroup-e2e' }],
    ['another demo project', { FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'demo-regroup' }],
    ['demo-regroup-e2e outside the emulator', { GCLOUD_PROJECT: 'demo-regroup-e2e' }],
    [
      'FUNCTIONS_EMULATOR not exactly "true"',
      { FUNCTIONS_EMULATOR: '1', GCLOUD_PROJECT: 'demo-regroup-e2e' },
    ],
    ['no env at all', {}],
  ])('is false for %s', (_name, env) => {
    expect(isE2EEmulator(env)).toBe(false);
  });
});

describe('isEmulatorFaultOn', () => {
  it('reads e2e/faults in the e2e emulator and honours a true flag', async () => {
    await expect(isEmulatorFaultOn('tierCatalogUnavailable', E2E_ENV)).resolves.toBe(true);
    expect(mockCollection).toHaveBeenCalledWith('e2e');
    expect(mockDoc).toHaveBeenCalledWith('faults');
  });

  it('is off when the flag is missing, not exactly true, or the doc is missing', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    await expect(isEmulatorFaultOn('tierCatalogUnavailable', E2E_ENV)).resolves.toBe(false);
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ tierCatalogUnavailable: 'true' }),
    });
    await expect(isEmulatorFaultOn('tierCatalogUnavailable', E2E_ENV)).resolves.toBe(false);
    mockGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
    await expect(isEmulatorFaultOn('tierCatalogUnavailable', E2E_ENV)).resolves.toBe(false);
  });

  it('is off when the read fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('unavailable'));
    await expect(isEmulatorFaultOn('tierCatalogUnavailable', E2E_ENV)).resolves.toBe(false);
  });

  it('is ignored in production: false, and Firestore is never read, even with the flag set', async () => {
    await expect(
      isEmulatorFaultOn('tierCatalogUnavailable', { GCLOUD_PROJECT: 'phoenix-cleanhouse' }),
    ).resolves.toBe(false);
    await expect(
      isEmulatorFaultOn('tierCatalogUnavailable', {
        FUNCTIONS_EMULATOR: 'true',
        GCLOUD_PROJECT: 'regroup-e2e',
      }),
    ).resolves.toBe(false);
    expect(mockCollection).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('defaults to process.env, which under Jest is not the e2e emulator', async () => {
    await expect(isEmulatorFaultOn('tierCatalogUnavailable')).resolves.toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
