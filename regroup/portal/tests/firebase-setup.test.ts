import { expect, vi } from 'vitest';

const callable = vi.hoisted(() => vi.fn(async () => ({ data: { tiers: { h1: 'owner' } } })));
const webFunctions = vi.hoisted(() => ({
  getFunctions: vi.fn(() => ({})),
  connectFunctionsEmulator: vi.fn(),
  httpsCallable: vi.fn(() => callable),
}));
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({ browserSessionPersistence: {}, connectAuthEmulator: vi.fn(), initializeAuth: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => ({ connectFirestoreEmulator: vi.fn(), initializeFirestore: vi.fn(() => ({})) }));
vi.mock('firebase/storage', () => ({ connectStorageEmulator: vi.fn(), getStorage: vi.fn(() => ({})) }));
vi.mock('firebase/functions', () => webFunctions);

import { functions } from '../src/adapter/firebase-setup';

// The phone's services/houseTiers.ts calls functions.httpsCallable(name), the older
// form. Without it the tier query failed and the Record payment button never showed.
test("the phone's functions.httpsCallable(name) calls the web SDK's httpsCallable", async () => {
  const result = await (functions as any).httpsCallable('myHouseTiers')({});
  expect(webFunctions.httpsCallable).toHaveBeenCalledWith(functions, 'myHouseTiers');
  expect(callable).toHaveBeenCalledWith({});
  expect(result).toEqual({ data: { tiers: { h1: 'owner' } } });
});
