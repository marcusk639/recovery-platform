// util/userClaims: every claims write stamps claims-updates/{uid}, which the app
// listens to so the affected user's token refreshes at once (S5 / REV-A5).
import * as fs from 'fs';
import * as path from 'path';

const mockSetCustomUserClaims = jest.fn();
const mockSet = jest.fn();
const mockDoc = jest.fn((_id: string) => ({ set: mockSet }));
const mockCollection = jest.fn((_name: string) => ({ doc: mockDoc }));
const mockServerTimestamp = jest.fn(() => 'SERVER_TS');
jest.mock('firebase-admin', () => {
  const firestore = Object.assign(() => ({ collection: mockCollection }), {
    FieldValue: { serverTimestamp: () => mockServerTimestamp() },
  });
  return {
    auth: () => ({ setCustomUserClaims: mockSetCustomUserClaims }),
    firestore,
  };
});
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from 'firebase-functions';
import { markClaimsUpdated, setUserClaims } from '../../util/userClaims';

beforeEach(() => {
  jest.clearAllMocks();
  mockSetCustomUserClaims.mockResolvedValue(undefined);
  mockSet.mockResolvedValue(undefined);
});

describe('setUserClaims', () => {
  it('writes the claims, then stamps claims-updates/{uid} with the server time', async () => {
    const order: string[] = [];
    mockSetCustomUserClaims.mockImplementation(async () => {
      order.push('claims');
    });
    mockSet.mockImplementation(async () => {
      order.push('marker');
    });

    await setUserClaims('u1', { guest: { h1: true } });

    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('u1', { guest: { h1: true } });
    expect(mockCollection).toHaveBeenCalledWith('claims-updates');
    expect(mockDoc).toHaveBeenCalledWith('u1');
    expect(mockSet).toHaveBeenCalledWith({ updatedAt: 'SERVER_TS' });
    expect(order).toEqual(['claims', 'marker']);
  });

  it('writes no marker when the claims write fails, and rethrows', async () => {
    mockSetCustomUserClaims.mockRejectedValue(new Error('auth down'));
    await expect(setUserClaims('u1', {})).rejects.toThrow('auth down');
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('does not fail the claims write when the marker write fails; logs the uid only', async () => {
    const error = new Error('firestore down');
    mockSet.mockRejectedValue(error);
    await expect(setUserClaims('u1', {})).resolves.toBeUndefined();
    expect(mockSetCustomUserClaims).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('claims_marker.write_failed', { uid: 'u1', error });
  });
});

describe('markClaimsUpdated', () => {
  it('stamps only the given account', async () => {
    await markClaimsUpdated('u2');
    expect(mockDoc).toHaveBeenCalledTimes(1);
    expect(mockDoc).toHaveBeenCalledWith('u2');
  });
});

describe('the only claims writer', () => {
  const srcRoot = path.join(__dirname, '../..');
  const sources = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(full);
      return entry.name.endsWith('.ts') ? [full] : [];
    });

  it('no source file but util/userClaims.ts calls setCustomUserClaims', () => {
    const callers = sources(srcRoot)
      .filter((file) => /\.setCustomUserClaims\s*\(/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(srcRoot, file));
    expect(callers).toEqual([path.join('util', 'userClaims.ts')]);
  });
});
