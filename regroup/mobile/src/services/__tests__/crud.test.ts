// src/services/__tests__/crud.test.ts
//
// Unit tests for the base CRUD layer (src/services/crud.tsx).
//
// crud.tsx does not import firebase-setup directly — it receives CollectionReference
// objects as arguments and calls methods on them. We therefore build lightweight
// mock collection objects per test suite so every Firestore interaction is
// fully observable without touching native code.

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  get,
  getByAttribute,
  create,
  update,
  deleteObject,
  add,
  createId,
} from '../crud';

// ─── Mock Collection Factory ──────────────────────────────────────────────────
//
// Builds a minimal mock CollectionReference whose internal doc/where helpers
// are all jest.Mock instances so tests can assert on call arguments and control
// resolved values.

function makeMockCollection(overrides: Record<string, any> = {}) {
  const mockDocRef = {
    id: 'generated-id',
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockWhereChain: any = {
    get: jest.fn(),
  };

  const mockCollection: any = {
    doc: jest.fn(() => mockDocRef),
    where: jest.fn(() => mockWhereChain),
    add: jest.fn(),
    _docRef: mockDocRef,
    _whereChain: mockWhereChain,
    ...overrides,
  };

  return mockCollection;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('crud service', () => {
  // ── get ───────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('calls collection.doc with the given id', async () => {
      const col = makeMockCollection();
      const entity = { id: 'e1', name: 'Entity One' };
      col._docRef.get.mockResolvedValue({ data: () => entity });

      await get(col, 'e1');

      expect(col.doc).toHaveBeenCalledWith('e1');
    });

    it('returns the data from the document snapshot', async () => {
      const col = makeMockCollection();
      const entity = { id: 'e1', name: 'Entity One' };
      col._docRef.get.mockResolvedValue({ data: () => entity });

      const result = await get(col, 'e1');

      expect(result).toEqual(entity);
    });

    it('returns null when the document does not exist', async () => {
      const col = makeMockCollection();
      col._docRef.get.mockResolvedValue({ data: () => null });

      const result = await get(col, 'missing');

      expect(result).toBeNull();
    });

    it('propagates Firestore errors', async () => {
      const col = makeMockCollection();
      col._docRef.get.mockRejectedValue(new Error('Firestore read error'));

      await expect(get(col, 'e1')).rejects.toThrow('Firestore read error');
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('sets the generated id on the object when id is absent', async () => {
      const col = makeMockCollection();
      col._docRef.set.mockResolvedValue(undefined);

      const entity: any = {};
      const result = await create(col, entity);

      // id should now be populated
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
    });

    it('uses the explicitly supplied id argument when object.id is absent', async () => {
      const col = makeMockCollection();
      col._docRef.set.mockResolvedValue(undefined);

      const entity: any = {};
      const result = await create(col, entity, 'explicit-id');

      expect(result.id).toBe('explicit-id');
    });

    it('preserves an existing id on the object', async () => {
      const col = makeMockCollection();
      col._docRef.set.mockResolvedValue(undefined);

      const entity: any = { id: 'existing-id' };
      const result = await create(col, entity, 'other-id');

      expect(result.id).toBe('existing-id');
    });

    it('calls collection.doc().set with the entity', async () => {
      const col = makeMockCollection();
      col._docRef.set.mockResolvedValue(undefined);

      const entity: any = { id: 'e1', name: 'Test' };
      await create(col, entity);

      expect(col.doc).toHaveBeenCalledWith('e1');
      expect(col._docRef.set).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'e1', name: 'Test' }),
      );
    });

    it('returns the entity (with id) after creation', async () => {
      const col = makeMockCollection();
      col._docRef.set.mockResolvedValue(undefined);

      const entity: any = { id: 'e1', value: 42 };
      const result = await create(col, entity);

      expect(result).toEqual(entity);
    });

    it('propagates errors from collection.doc().set', async () => {
      const col = makeMockCollection();
      col._docRef.set.mockRejectedValue(new Error('Write failed'));

      await expect(create(col, { id: 'e1' } as any)).rejects.toThrow('Write failed');
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls collection.doc with the object id when id is present', async () => {
      const col = makeMockCollection();
      col._docRef.update.mockResolvedValue(undefined);

      await update(col, { id: 'e1', name: 'Updated' });

      expect(col.doc).toHaveBeenCalledWith('e1');
    });

    it('calls collection.doc with uid when uid is present (no id)', async () => {
      const col = makeMockCollection();
      col._docRef.update.mockResolvedValue(undefined);

      await update(col, { uid: 'user-uid-1', name: 'Updated User' });

      expect(col.doc).toHaveBeenCalledWith('user-uid-1');
    });

    it('calls doc().update with the partial object', async () => {
      const col = makeMockCollection();
      col._docRef.update.mockResolvedValue(undefined);

      const partial = { id: 'e1', name: 'New Name' };
      await update(col, partial);

      expect(col._docRef.update).toHaveBeenCalledWith(partial);
    });

    it('throws when neither id nor uid is present on the object', async () => {
      const col = makeMockCollection();

      await expect(update(col, { name: 'No Id' } as any)).rejects.toThrow(
        'Item must have an id or uid attribute',
      );
    });

    it('propagates errors from doc().update', async () => {
      const col = makeMockCollection();
      col._docRef.update.mockRejectedValue(new Error('Update failed'));

      await expect(update(col, { id: 'e1' })).rejects.toThrow('Update failed');
    });
  });

  // ── deleteObject ──────────────────────────────────────────────────────────

  describe('deleteObject', () => {
    it('calls collection.doc with the object id when id is present', async () => {
      const col = makeMockCollection();
      col._docRef.delete.mockResolvedValue(undefined);

      await deleteObject(col, { id: 'e1' } as any);

      expect(col.doc).toHaveBeenCalledWith('e1');
    });

    it('calls collection.doc with uid when uid is present (no id)', async () => {
      const col = makeMockCollection();
      col._docRef.delete.mockResolvedValue(undefined);

      await deleteObject(col, { uid: 'user-uid-1' } as any);

      expect(col.doc).toHaveBeenCalledWith('user-uid-1');
    });

    it('calls doc().delete()', async () => {
      const col = makeMockCollection();
      col._docRef.delete.mockResolvedValue(undefined);

      await deleteObject(col, { id: 'e1' } as any);

      expect(col._docRef.delete).toHaveBeenCalledTimes(1);
    });

    it('throws when neither id nor uid is present', async () => {
      const col = makeMockCollection();

      await expect(deleteObject(col, {} as any)).rejects.toThrow(
        'Item must have an id or uid attribute',
      );
    });

    it('propagates errors from doc().delete', async () => {
      const col = makeMockCollection();
      col._docRef.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(deleteObject(col, { id: 'e1' } as any)).rejects.toThrow(
        'Delete failed',
      );
    });
  });

  // ── getByAttribute ────────────────────────────────────────────────────────

  describe('getByAttribute', () => {
    it('calls collection.where with attribute, operator, and value', async () => {
      const col = makeMockCollection();
      col._whereChain.get.mockResolvedValue({ docs: [] });

      await getByAttribute(col, 'houseId', '==', 'h1');

      expect(col.where).toHaveBeenCalledWith('houseId', '==', 'h1');
    });

    it('returns mapped doc data when documents exist', async () => {
      const col = makeMockCollection();
      const docs = [
        { data: () => ({ id: 'e1', name: 'A' }) },
        { data: () => ({ id: 'e2', name: 'B' }) },
      ];
      col._whereChain.get.mockResolvedValue({ docs });

      const result = await getByAttribute(col, 'name', '==', 'A');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'e1', name: 'A' });
      expect(result[1]).toEqual({ id: 'e2', name: 'B' });
    });

    it('returns an empty array when no documents match', async () => {
      const col = makeMockCollection();
      col._whereChain.get.mockResolvedValue({ docs: [] });

      const result = await getByAttribute(col, 'status', '==', 'missing');

      expect(result).toEqual([]);
    });

    it('supports boolean values', async () => {
      const col = makeMockCollection();
      col._whereChain.get.mockResolvedValue({ docs: [] });

      await getByAttribute(col, 'isActive', '==', true);

      expect(col.where).toHaveBeenCalledWith('isActive', '==', true);
    });

    it('supports numeric values', async () => {
      const col = makeMockCollection();
      col._whereChain.get.mockResolvedValue({ docs: [] });

      await getByAttribute(col, 'count', '>', 5);

      expect(col.where).toHaveBeenCalledWith('count', '>', 5);
    });

    it('supports null values', async () => {
      const col = makeMockCollection();
      col._whereChain.get.mockResolvedValue({ docs: [] });

      await getByAttribute(col, 'deletedAt', '==', null);

      expect(col.where).toHaveBeenCalledWith('deletedAt', '==', null);
    });

    it('propagates Firestore errors', async () => {
      const col = makeMockCollection();
      col._whereChain.get.mockRejectedValue(new Error('Query failed'));

      await expect(getByAttribute(col, 'x', '==', 'y')).rejects.toThrow(
        'Query failed',
      );
    });
  });

  // ── createId ──────────────────────────────────────────────────────────────

  describe('createId', () => {
    it('returns the id from collection.doc().id', () => {
      const col = makeMockCollection();

      const id = createId(col);

      // The mock doc returns { id: 'generated-id' }
      expect(id).toBe('generated-id');
    });

    it('calls collection.doc with no arguments', () => {
      const col = makeMockCollection();

      createId(col);

      expect(col.doc).toHaveBeenCalledWith();
    });
  });

  // ── add ───────────────────────────────────────────────────────────────────

  describe('add', () => {
    it('calls collection.add with the entity object', async () => {
      const col = makeMockCollection();
      const docRef = { id: 'new-doc-id' };
      col.add.mockResolvedValue(docRef);

      const entity: any = { id: 'e1', name: 'Test Entity' };
      await add(col, entity);

      expect(col.add).toHaveBeenCalledWith(entity);
    });

    it('returns the DocumentReference from collection.add', async () => {
      const col = makeMockCollection();
      const docRef = { id: 'new-doc-id' };
      col.add.mockResolvedValue(docRef);

      const result = await add(col, { id: 'e1' } as any);

      expect(result).toEqual(docRef);
    });

    it('propagates errors from collection.add', async () => {
      const col = makeMockCollection();
      col.add.mockRejectedValue(new Error('Add failed'));

      await expect(add(col, { id: 'e1' } as any)).rejects.toThrow('Add failed');
    });
  });
});
