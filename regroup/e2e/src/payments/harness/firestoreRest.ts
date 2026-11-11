import { idTokenFor } from './callables';
import { PROJECT } from './guards';

// Client writes through the Firestore REST API, so the emulator applies the
// security rules to them as it does to the app. The Admin SDK would skip the rules.

export type EncodedFields = Record<string, unknown>;
export type DocWrite = Record<string, unknown>;

const docName = (path: string) => `projects/${PROJECT}/databases/(default)/documents/${path}`;
const emulatorUrl = (suffix: string) =>
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/${docName(suffix)}`;

function encodeValue(value: unknown, key: string): unknown {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value))
    return { arrayValue: { values: value.map((item) => encodeValue(item, key)) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value as object) } };
  throw new Error(`cannot encode field ${key}`);
}

export function encodeFields(data: object): EncodedFields {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, encodeValue(value, key)]),
  );
}

export const setDoc = (path: string, data: object): DocWrite => ({
  update: { name: docName(path), fields: encodeFields(data) },
});

/** Writes only the given fields of an existing document, like the client SDK's update(). */
export const updateFields = (path: string, fields: EncodedFields): DocWrite => ({
  update: { name: docName(path), fields },
  updateMask: { fieldPaths: Object.keys(fields) },
  currentDocument: { exists: true },
});

/** Commits the writes atomically as this user, like a client batch. */
export async function commitAs(
  uid: string,
  writes: DocWrite[],
): Promise<{ status: number; body: string }> {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await idTokenFor(uid)}`,
      },
      body: JSON.stringify({ writes }),
    },
  );
  return { status: res.status, body: await res.text() };
}

/** Reads a document's encoded fields as this user, through the security rules. */
export async function getFieldsAs(uid: string, path: string): Promise<EncodedFields> {
  const res = await fetch(emulatorUrl(path), {
    headers: { authorization: `Bearer ${await idTokenFor(uid)}` },
  });
  if (res.status !== 200) throw new Error(`reading ${path} answered ${res.status}`);
  return ((await res.json()) as { fields?: EncodedFields }).fields ?? {};
}
