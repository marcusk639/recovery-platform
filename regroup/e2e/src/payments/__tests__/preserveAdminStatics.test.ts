import '../../../emulator/preserve-admin-statics.js';

describe('preserve-admin-statics', () => {
  it('keeps FieldValue and Timestamp when the Firestore namespace function is bound', () => {
    const firestore = Object.assign(() => 'db', { FieldValue: { delete: () => 'd' }, Timestamp: { now: () => 1 } });
    const bound = firestore.bind(null);
    expect(bound()).toBe('db');
    expect(bound.FieldValue.delete()).toBe('d');
    expect(bound.Timestamp.now()).toBe(1);
  });

  it('leaves other functions alone', () => {
    const plain = Object.assign(() => 1, { other: true });
    expect((plain.bind(null) as unknown as { other?: boolean }).other).toBeUndefined();
  });
});
