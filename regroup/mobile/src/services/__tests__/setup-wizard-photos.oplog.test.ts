/**
 * setup-wizard-photos.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10c): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes. Storage is not part of the log: the
 * firebase-modular storage mock resolves every upload, so an upload failure
 * cannot be staged here (setup-wizard-photos.test.ts covers it).
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/storage', () =>
  require('../../../__mocks__/firebase-modular/storage'),
);
jest.mock('../../../google/timezone', () => ({ getTimezone: jest.fn(async () => 'UTC') }));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { getOpLog, readDoc, resetOpLog, seedDoc } from '../../../__mocks__/firebase-modular/log';
import { applyHousePhotos } from '../setup-wizard-photos';
import { Houses } from '../../types';

const url = (houseId: string) => `https://mock-storage/houses/${houseId}/photo`;

beforeEach(() => {
  resetOpLog();
});

describe('applyHousePhotos', () => {
  it('updates houses/{id} with the uploaded URL as imageUrl and avatar', async () => {
    seedDoc('houses/h1', { id: 'h1' });
    const houses = {
      h1: { id: 'h1', imageUrl: 'file:///h1.jpg' },
      h2: { id: 'h2', imageUrl: '' },
    } as unknown as Houses;

    expect(await applyHousePhotos(houses)).toBe(0);
    expect(getOpLog()).toEqual([
      { op: 'update', path: 'houses/h1', data: { imageUrl: url('h1'), avatar: url('h1') } },
    ]);
    expect(houses.h1).toEqual(expect.objectContaining({ imageUrl: url('h1'), avatar: url('h1') }));
    expect(readDoc('houses/h1')).toEqual({ id: 'h1', imageUrl: url('h1'), avatar: url('h1') });
  });

  it('makes no write when no house has a photo', async () => {
    const houses = { h1: { id: 'h1' } } as unknown as Houses;

    expect(await applyHousePhotos(houses)).toBe(0);
    expect(getOpLog()).toEqual([]);
  });

  it('counts a failed update and clears that house photo, without stopping the others', async () => {
    seedDoc('houses/h1', { id: 'h1' });
    const houses = {
      h1: { id: 'h1', imageUrl: 'file:///h1.jpg' },
      h3: { id: 'h3', imageUrl: 'file:///h3.jpg' },
    } as unknown as Houses;

    expect(await applyHousePhotos(houses)).toBe(1);
    expect(getOpLog()).toEqual([
      { op: 'update', path: 'houses/h1', data: { imageUrl: url('h1'), avatar: url('h1') } },
      { op: 'update', path: 'houses/h3', data: { imageUrl: url('h3'), avatar: url('h3') } },
    ]);
    expect(houses.h3).toEqual(expect.objectContaining({ imageUrl: '', avatar: '' }));
    expect(houses.h1.imageUrl).toBe(url('h1'));
  });
});
