import { arrayUnion, deleteField, GeoPoint, increment, serverTimestamp, Timestamp } from 'firebase/firestore';
import { plainData } from '../src/adapter/firebase/plain-data';

class Entity {
  id = 'g1';
  firstName = 'Nora';
  nested = new (class Inner {
    room = '2A';
  })();
  method() {
    return 'not data';
  }
}

test('a class instance becomes a plain object with the same fields', () => {
  const plain = plainData(new Entity()) as Record<string, unknown>;
  expect(Object.getPrototypeOf(plain)).toBe(Object.prototype);
  expect(plain).toEqual({ id: 'g1', firstName: 'Nora', nested: { room: '2A' } });
  expect(Object.getPrototypeOf(plain.nested)).toBe(Object.prototype);
  expect('method' in plain).toBe(false);
});
test('instances inside arrays and plain objects are converted too', () => {
  const plain = plainData({ list: [new Entity()], deep: { e: new Entity() } }) as any;
  expect(Object.getPrototypeOf(plain.list[0])).toBe(Object.prototype);
  expect(Object.getPrototypeOf(plain.deep.e)).toBe(Object.prototype);
});
test("Firestore's own values pass through untouched", () => {
  const values = [increment(-500), serverTimestamp(), deleteField(), arrayUnion('x'), Timestamp.now(), new GeoPoint(1, 2), new Date(0)];
  const plain = plainData({ values }) as { values: unknown[] };
  plain.values.forEach((value, i) => expect(value).toBe(values[i]));
});
test('plain values and undefined are left as they are', () => {
  expect(plainData({ a: 1, b: 'x', c: null, d: undefined, e: true })).toEqual({ a: 1, b: 'x', c: null, d: undefined, e: true });
});
