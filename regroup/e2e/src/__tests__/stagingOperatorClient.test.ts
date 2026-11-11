import { buildOperatorUserDoc, StagingConfig } from '../stagingOperator/staging';
import {
  createStagingClient,
  FetchFn,
  fromFirestoreFields,
  toFirestoreFields,
} from '../stagingOperator/stagingClient';

const config: StagingConfig = { apiKey: 'AIza-test', projectId: 'regroup-e2e' };
const FIRESTORE =
  'https://firestore.googleapis.com/v1/projects/regroup-e2e/databases/(default)/documents';

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as FetchFn;
  return { calls, fetchFn };
}

const bodyOf = (call: Call) => JSON.parse(String(call.init.body));
const headersOf = (call: Call) => new Headers(call.init.headers);

describe('Firestore value encoding', () => {
  it("encodes the operator doc so the rules' empty-subscription shape survives", () => {
    const doc = buildOperatorUserDoc('u1', 'a@rats-e2e.com');
    const fields = toFirestoreFields(doc) as Record<string, any>;

    expect(fromFirestoreFields(fields)).toEqual(doc);
    expect(fields.subscriptionMetadata.mapValue.fields.houses).toEqual({ mapValue: {} });
    expect(fields.houseCode).toEqual({ nullValue: null });
    expect(fields.isSuperAdmin).toEqual({ booleanValue: true });
    expect(fields.subscriptionMetadata.mapValue.fields.currentPeriodEnd).toEqual({
      integerValue: '0',
    });
  });

  it('decodes the values a subscribed user doc carries', () => {
    expect(
      fromFirestoreFields({
        n: { doubleValue: 1.5 },
        list: { arrayValue: { values: [{ stringValue: 'a' }] } },
        empty: { arrayValue: {} },
        at: { timestampValue: '2026-11-09T22:05:07Z' },
      }),
    ).toEqual({ n: 1.5, list: ['a'], empty: [], at: '2026-11-09T22:05:07Z' });
  });
});

describe('createStagingClient', () => {
  it('signs up with the API key and returns the uid and token', async () => {
    const { calls, fetchFn } = fakeFetch(200, { localId: 'u1', idToken: 'tok' });
    const result = await createStagingClient(config, fetchFn).signUp('a@rats-e2e.com', 'pw');

    expect(result).toEqual({ uid: 'u1', idToken: 'tok' });
    expect(calls[0].url).toBe(
      'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=AIza-test',
    );
    expect(calls[0].init.method).toBe('POST');
    expect(bodyOf(calls[0])).toEqual({
      email: 'a@rats-e2e.com',
      password: 'pw',
      returnSecureToken: true,
    });
    expect(headersOf(calls[0]).get('Authorization')).toBeNull();
  });

  it("looks up the API key's project", async () => {
    const { calls, fetchFn } = fakeFetch(200, { projectId: '706803426891', authorizedDomains: [] });
    const project = await createStagingClient(config, fetchFn).keyProject();

    expect(project).toBe('706803426891');
    expect(calls[0].url).toBe(
      'https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=AIza-test',
    );
    expect(calls[0].init.method).toBe('GET');
  });

  it('creates the user doc as the user', async () => {
    const { calls, fetchFn } = fakeFetch(200, { name: 'x' });
    await createStagingClient(config, fetchFn).createUserDoc('tok', 'u1', {
      email: 'a@rats-e2e.com',
    });

    expect(calls[0].url).toBe(`${FIRESTORE}/users?documentId=u1`);
    expect(calls[0].init.method).toBe('POST');
    expect(headersOf(calls[0]).get('Authorization')).toBe('Bearer tok');
    expect(bodyOf(calls[0])).toEqual({ fields: { email: { stringValue: 'a@rats-e2e.com' } } });
  });

  it('reads the user doc back as the user', async () => {
    const { calls, fetchFn } = fakeFetch(200, { fields: { tier: { stringValue: 'starter' } } });
    const doc = await createStagingClient(config, fetchFn).readUserDoc('tok', 'u1');

    expect(doc).toEqual({ tier: 'starter' });
    expect(calls[0].url).toBe(`${FIRESTORE}/users/u1`);
    expect(calls[0].init.method).toBe('GET');
    expect(headersOf(calls[0]).get('Authorization')).toBe('Bearer tok');
  });

  it('calls a function and returns its result', async () => {
    const { calls, fetchFn } = fakeFetch(200, { result: { ok: true } });
    const result = await createStagingClient(config, fetchFn).callFunction(
      'tok',
      'createOperatorSubscription',
      {
        tier: 'starter',
      },
    );

    expect(result).toEqual({ ok: true });
    expect(calls[0].url).toBe(
      'https://us-central1-regroup-e2e.cloudfunctions.net/createOperatorSubscription',
    );
    expect(headersOf(calls[0]).get('Authorization')).toBe('Bearer tok');
    expect(bodyOf(calls[0])).toEqual({ data: { tier: 'starter' } });
  });

  it.each([200, 400])("raises the callable's error message (HTTP %i)", async (status) => {
    const { fetchFn } = fakeFetch(status, {
      error: { status: 'FAILED_PRECONDITION', message: 'Card declined' },
    });
    await expect(
      createStagingClient(config, fetchFn).callFunction('tok', 'createOperatorSubscription', {}),
    ).rejects.toThrow('Card declined');
  });

  it('raises Auth and Firestore errors with their status and message', async () => {
    const auth = fakeFetch(400, { error: { code: 400, message: 'EMAIL_EXISTS' } });
    await expect(
      createStagingClient(config, auth.fetchFn).signUp('a@rats-e2e.com', 'pw'),
    ).rejects.toThrow(/400.*EMAIL_EXISTS/);
    const firestore = fakeFetch(403, {
      error: { code: 403, message: 'Missing or insufficient permissions.' },
    });
    await expect(
      createStagingClient(config, firestore.fetchFn).createUserDoc('tok', 'u1', {}),
    ).rejects.toThrow(/403.*insufficient permissions/);
  });

  it('never puts the token or password in an error', async () => {
    const { fetchFn } = fakeFetch(400, { error: { message: 'WEAK_PASSWORD' } });
    const err = await createStagingClient(config, fetchFn)
      .signUp('a@rats-e2e.com', 'secret-pw')
      .catch((e) => e);
    expect(String(err.message)).not.toContain('secret-pw');
    const call = fakeFetch(500, { error: { message: 'boom' } });
    const err2 = await createStagingClient(config, call.fetchFn)
      .readUserDoc('secret-token', 'u1')
      .catch((e) => e);
    expect(String(err2.message)).not.toContain('secret-token');
  });
});
