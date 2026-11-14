/**
 * crud.tsx against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 9): written on
 * the namespaced API and unchanged by the move to the modular API, so the
 * paths, payloads and constraints each helper sends are pinned across it.
 */
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);

import { instance as firestore } from '../../../__mocks__/firebase-modular/firestore';
import {
  failNext,
  getOpLog,
  resetOpLog,
  seedDoc,
  seedQuery,
} from '../../../__mocks__/firebase-modular/log';
import { add, create, createId, deleteObject, get, getByAttribute, update } from '../crud';

// The mock is plain JS; crud only needs a collection ref from it.
const houses = () => (firestore as any).collection('houses');

beforeEach(() => {
  resetOpLog();
});

describe('get', () => {
  it('reads houses/{id} and returns its data', async () => {
    seedDoc('houses/h1', { name: 'Oak' });

    expect(await get(houses(), 'h1')).toEqual({ name: 'Oak' });
    expect(getOpLog()).toEqual([{ op: 'get', path: 'houses/h1' }]);
  });

  it('returns undefined for a missing document', async () => {
    expect(await get(houses(), 'missing')).toBeUndefined();
    expect(getOpLog()).toEqual([{ op: 'get', path: 'houses/missing' }]);
  });
});

describe('getByAttribute', () => {
  it('queries with one where constraint and returns the matches', async () => {
    seedQuery('houses', [{ id: 'h1', city: 'Austin' }]);

    expect(await getByAttribute(houses(), 'city', '==', 'Austin')).toEqual([{ city: 'Austin' }]);
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: 'houses', constraints: [['where', 'city', '==', 'Austin']] },
    ]);
  });

  it('returns an empty array when nothing matches', async () => {
    expect(await getByAttribute(houses(), 'city', '==', 'Nowhere')).toEqual([]);
  });
});

describe('update', () => {
  it('updates the document named by id with the whole object', async () => {
    seedDoc('houses/h1', { name: 'Oak' });

    await update(houses(), { id: 'h1', name: 'Elm' });

    expect(getOpLog()).toEqual([
      { op: 'update', path: 'houses/h1', data: { id: 'h1', name: 'Elm' } },
    ]);
  });

  it('prefers uid over id', async () => {
    seedDoc('houses/u1', {});

    await update(houses(), { uid: 'u1', id: 'ignored', name: 'Elm' } as any);

    expect(getOpLog()[0].path).toBe('houses/u1');
  });

  it('refuses an object with neither id nor uid, writing nothing', async () => {
    await expect(update(houses(), { name: 'Elm' } as any)).rejects.toThrow(
      'Item must have an id or uid attribute',
    );
    expect(getOpLog()).toEqual([]);
  });
});

describe('deleteObject', () => {
  it('deletes the document named by uid, else id', async () => {
    await deleteObject(houses(), { id: 'h1' });
    await deleteObject(houses(), { uid: 'u1', id: 'h2' });

    expect(getOpLog()).toEqual([
      { op: 'delete', path: 'houses/h1' },
      { op: 'delete', path: 'houses/u1' },
    ]);
  });
});

describe('create', () => {
  it('sets the object at its own id', async () => {
    const created = await create(houses(), { id: 'h1', name: 'Oak' });

    expect(created).toEqual({ id: 'h1', name: 'Oak' });
    expect(getOpLog()).toEqual([{ op: 'set', path: 'houses/h1', data: { id: 'h1', name: 'Oak' } }]);
  });

  it('uses the given id when the object has none', async () => {
    await create(houses(), { name: 'Oak' } as any, 'given');

    expect(getOpLog()).toEqual([
      { op: 'set', path: 'houses/given', data: { id: 'given', name: 'Oak' } },
    ]);
  });

  it('generates an id when neither is present', async () => {
    const created = await create(houses(), { name: 'Oak' } as any);

    expect(created.id).toBe('auto-1');
    expect(getOpLog()).toEqual([
      { op: 'set', path: 'houses/auto-1', data: { id: 'auto-1', name: 'Oak' } },
    ]);
  });

  it('propagates a failed write', async () => {
    failNext('set', new Error('permission-denied'));

    await expect(create(houses(), { id: 'h1' })).rejects.toThrow('permission-denied');
  });
});

describe('add', () => {
  it('adds the object to the collection under a generated id', async () => {
    const ref = await add(houses(), { name: 'Oak' } as any);

    expect(ref.id).toBe('auto-1');
    expect(getOpLog()).toEqual([{ op: 'add', path: 'houses', data: { name: 'Oak' } }]);
  });
});

describe('createId', () => {
  it('generates an id without writing', () => {
    expect(createId(houses())).toBe('auto-1');
    expect(getOpLog()).toEqual([]);
  });
});
