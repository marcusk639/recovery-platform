import { getAuth } from 'firebase-admin/auth';
import { adminApp } from './fixtures';
import { FUNCTIONS_BASE } from './guards';

const tokens = new Map<string, string>();

async function idTokenFor(uid: string): Promise<string> {
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
  const body = (await res.json()) as { result?: unknown; error?: { status: string; message: string } };
  if (body.error) {
    return { errorCode: body.error.status.toLowerCase().replace(/_/g, '-'), errorMessage: body.error.message };
  }
  return { data: body.result };
}
