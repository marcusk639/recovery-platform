// RN Firebase serialises any object it's given. The web SDK refuses an instance of
// a custom class ("a custom Guest object"), and the phone's code writes some, such
// as intake's `new Guest()`. Writes go through this first, so they reach Firestore
// as the phone sends them. Firestore's own values are kept as they are.
import * as web from 'firebase/firestore';

const KEPT = [web.FieldValue, web.Timestamp, web.GeoPoint, web.Bytes, web.DocumentReference, Date];

const isKept = (value: object) =>
  KEPT.some((type) => typeof type === 'function' && value instanceof (type as abstract new (...args: never[]) => unknown));

export function plainData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plainData);
  if (!value || typeof value !== 'object' || isKept(value)) return value;
  const plain: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) plain[key] = plainData(field);
  return plain;
}
