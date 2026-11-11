import { encodeFields, setDoc, updateFields } from '../harness/firestoreRest';

describe('encodeFields', () => {
  it('encodes each JSON type the way the Firestore REST API expects', () => {
    expect(encodeFields({ a: 'x', b: 2, c: 1.5, d: true, e: null, f: ['y'], g: { h: 0 } })).toEqual(
      {
        a: { stringValue: 'x' },
        b: { integerValue: '2' },
        c: { doubleValue: 1.5 },
        d: { booleanValue: true },
        e: { nullValue: null },
        f: { arrayValue: { values: [{ stringValue: 'y' }] } },
        g: { mapValue: { fields: { h: { integerValue: '0' } } } },
      },
    );
  });

  it('keeps empty arrays and maps, which the guest self-create rule checks', () => {
    expect(encodeFields({ jobs: [], rooms: {} })).toEqual({
      jobs: { arrayValue: { values: [] } },
      rooms: { mapValue: { fields: {} } },
    });
  });

  it('refuses a value it cannot encode rather than dropping it', () => {
    expect(() => encodeFields({ a: undefined })).toThrow(/a/);
  });
});

describe('writes', () => {
  it('names the document and replaces it on set', () => {
    const write = setDoc('guests/g1', { a: 'x' }) as {
      update: { name: string };
      updateMask?: unknown;
    };
    expect(write.update.name).toMatch(/\/documents\/guests\/g1$/);
    expect(write.updateMask).toBeUndefined();
  });

  it('touches only the named fields of an existing document on update', () => {
    const write = updateFields('users/u1', encodeFields({ a: 'x' }));
    expect(write).toMatchObject({
      updateMask: { fieldPaths: ['a'] },
      currentDocument: { exists: true },
    });
  });
});
