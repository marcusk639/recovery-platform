import { StagingConfig } from './staging';

export type FetchFn = typeof fetch;

export interface StagingClient {
  signUp(email: string, password: string): Promise<{ uid: string; idToken: string }>;
  createUserDoc(idToken: string, uid: string, doc: Record<string, unknown>): Promise<void>;
  readUserDoc(idToken: string, uid: string): Promise<Record<string, unknown>>;
  callFunction<T>(idToken: string, name: string, data: unknown): Promise<T>;
}

type FirestoreValue = Record<string, unknown>;

function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return value.length ? { arrayValue: { values: value.map(encodeValue) } } : { arrayValue: {} };
  }
  if (typeof value === 'object') {
    const fields = toFirestoreFields(value as Record<string, unknown>);
    return Object.keys(fields).length ? { mapValue: { fields } } : { mapValue: {} };
  }
  throw new Error(`Cannot store a ${typeof value} in Firestore`);
}

function decodeValue(value: FirestoreValue): unknown {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('arrayValue' in value) {
    const values = (value.arrayValue as { values?: FirestoreValue[] }).values ?? [];
    return values.map(decodeValue);
  }
  if ('mapValue' in value) {
    return fromFirestoreFields(
      (value.mapValue as { fields?: Record<string, unknown> }).fields ?? {},
    );
  }
  throw new Error(`Unsupported Firestore value: ${Object.keys(value).join(', ')}`);
}

export function toFirestoreFields(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeValue(v)]));
}

export function fromFirestoreFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, decodeValue(v as FirestoreValue)]),
  );
}

/** The server's own message from a Google API or callable error body, if it has one. */
function serverMessage(body: unknown): string | undefined {
  const error = (body as { error?: { message?: unknown } } | null)?.error;
  return typeof error?.message === 'string' ? error.message : undefined;
}

export function createStagingClient(config: StagingConfig, fetchFn: FetchFn): StagingClient {
  const firestoreBase = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents`;
  const functionsBase = `https://us-central1-${config.projectId}.cloudfunctions.net`;

  // Errors carry the endpoint, the status and the server's message: never a request
  // body, token or password.
  async function request(endpoint: string, url: string, init: RequestInit): Promise<unknown> {
    const response = await fetchFn(url, init);
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const message = serverMessage(body);
    if (!response.ok || message !== undefined) {
      throw new Error(
        `${endpoint} failed (HTTP ${response.status}): ${message ?? 'no error message'}`,
      );
    }
    return body;
  }

  const json = (idToken?: string): HeadersInit => ({
    'Content-Type': 'application/json',
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  });

  return {
    async signUp(email, password) {
      const body = (await request(
        'Auth signUp',
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`,
        {
          method: 'POST',
          headers: json(),
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        },
      )) as { localId: string; idToken: string };
      return { uid: body.localId, idToken: body.idToken };
    },

    async createUserDoc(idToken, uid, doc) {
      await request(
        'Firestore create users doc',
        `${firestoreBase}/users?documentId=${encodeURIComponent(uid)}`,
        {
          method: 'POST',
          headers: json(idToken),
          body: JSON.stringify({ fields: toFirestoreFields(doc) }),
        },
      );
    },

    async readUserDoc(idToken, uid) {
      const body = (await request(
        'Firestore read users doc',
        `${firestoreBase}/users/${encodeURIComponent(uid)}`,
        {
          method: 'GET',
          headers: json(idToken),
        },
      )) as { fields?: Record<string, unknown> };
      return fromFirestoreFields(body.fields ?? {});
    },

    async callFunction<T>(idToken: string, name: string, data: unknown): Promise<T> {
      const body = (await request(name, `${functionsBase}/${name}`, {
        method: 'POST',
        headers: json(idToken),
        body: JSON.stringify({ data }),
      })) as { result: T };
      return body.result;
    },
  };
}
