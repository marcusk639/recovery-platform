/**
 * Direct messages (#183 item 2). A chat doc is readable only by its senderId
 * or recipientId, so a list query over direct-messages/{id}/chat must filter
 * to the caller's own messages: the old unfiltered query was refused, and the
 * screen never loaded. loadDirectChat and subscribeToDirectChat now send
 * or(senderId == me, recipientId == me); these tests pin that the rules accept
 * that query, still refuse the unfiltered one, and give nobody else the chat.
 *
 * Requires the Firestore emulator (FIRESTORE_EMULATOR_HOST, set by
 * `firebase emulators:exec`).
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDocs,
  limit,
  or,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const CHAT = 'direct-messages/adminDocguestDoc/chat';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rats-direct-messages-rules-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: HOST,
      port: Number(PORT),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `${CHAT}/m1`), {
      text: 'hi',
      senderId: 'manager',
      recipientId: 'resident',
      sortKey: 1,
    });
    await setDoc(doc(db, `${CHAT}/m2`), {
      text: 'hello',
      senderId: 'resident',
      recipientId: 'manager',
      sortKey: 2,
    });
  });
});

const chatFor = (uid: string) => collection(testEnv.authenticatedContext(uid).firestore(), CHAT);

// The query loadDirectChat sends.
const ownMessages = (uid: string) =>
  query(
    chatFor(uid),
    or(where('senderId', '==', uid), where('recipientId', '==', uid)),
    orderBy('sortKey', 'desc'),
    limit(20),
  );

describe('direct-messages/{id}/chat list queries', () => {
  it('DENIES the unfiltered query the app used to send', async () => {
    await assertFails(getDocs(query(chatFor('resident'), orderBy('sortKey', 'desc'), limit(20))));
  });

  it("ALLOWS a participant's sender-or-recipient query and returns both sides", async () => {
    const snap = await assertSucceeds(getDocs(ownMessages('resident')));
    expect(snap.docs.map((d: { id: string }) => d.id).sort()).toEqual(['m1', 'm2']);
  });

  it('ALLOWS the other participant the same query', async () => {
    const snap = await assertSucceeds(getDocs(ownMessages('manager')));
    expect(snap.docs.map((d: { id: string }) => d.id).sort()).toEqual(['m1', 'm2']);
  });

  it('gives a third user nothing: their own filter matches no message', async () => {
    const snap = await assertSucceeds(getDocs(ownMessages('stranger')));
    expect(snap.empty).toBe(true);
  });

  it("DENIES a third user filtering on a participant's uid", async () => {
    const q = query(
      chatFor('stranger'),
      or(where('senderId', '==', 'resident'), where('recipientId', '==', 'resident')),
      orderBy('sortKey', 'desc'),
    );
    await assertFails(getDocs(q));
  });

  it('DENIES a signed-out caller', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      getDocs(
        query(
          collection(db, CHAT),
          or(where('senderId', '==', 'resident'), where('recipientId', '==', 'resident')),
        ),
      ),
    );
  });
});
