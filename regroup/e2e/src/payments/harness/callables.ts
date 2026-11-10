import { getAuth } from 'firebase-admin/auth';
import { adminApp } from './fixtures';
import { FUNCTIONS_BASE, PROJECT } from './guards';
import { idTokens as tokens } from './idTokens';

export async function idTokenFor(uid: string): Promise<string> {
  const cached = tokens.get(uid);
  if (cached) return cached;
  const customToken = await getAuth(adminApp()).createCustomToken(uid);
  const res = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const body = (await res.json()) as { idToken?: string };
  if (!body.idToken) throw new Error(`no emulator id token for ${uid} (${res.status})`);
  tokens.set(uid, body.idToken);
  return body.idToken;
}

/** Signs in with the password, as the app does. A new sign-in carries the account's current claims. */
export async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = (await res.json()) as { idToken?: string; localId?: string };
  if (!body.idToken || !body.localId) throw new Error(`sign-in refused for ${email} (${res.status})`);
  tokens.set(body.localId, body.idToken);
  return body.localId;
}

/** Calls a callable as this user. `uid` null calls it signed out. */
export async function callAs(
  uid: string | null,
  name: string,
  data: unknown,
): Promise<{ data?: unknown; errorCode?: string; errorMessage?: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (uid) headers.authorization = `Bearer ${await idTokenFor(uid)}`;
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  });
  const text = await res.text();
  let body: { result?: unknown; error?: { status: string; message: string } };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${name} answered ${res.status} with a body that isn't JSON (is the function deployed to the emulator?)`);
  }
  if (!body || typeof body !== 'object') throw new Error(`${name} answered ${res.status} with ${JSON.stringify(body)}`);
  if (body.error) {
    return { errorCode: body.error.status.toLowerCase().replace(/_/g, '-'), errorMessage: body.error.message };
  }
  // A callable always answers {result} (null for no value), so its absence isn't a success.
  if (!('result' in body)) throw new Error(`${name} answered ${res.status} with neither result nor error`);
  return { data: body.result };
}

/** Reads a document as this user, through the security rules. Returns the HTTP status. */
export async function readDocAs(uid: string, docPath: string): Promise<number> {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`,
    { headers: { authorization: `Bearer ${await idTokenFor(uid)}` } },
  );
  return res.status;
}
