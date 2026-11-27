/**
 * Picks up a role change made by someone else (S5, REV-A5).
 *
 * The ID token keeps the custom claims it was minted with for up to an hour,
 * and the rules read the token. The server stamps `claims-updates/{uid}` after
 * every claims write (functions `util/userClaims.ts`); this listens to the
 * signed-in account's doc and force-refreshes the token when the stamp is
 * newer than the token, so a promotion, demotion or removal from a house
 * reaches the app in seconds.
 */
import { collection, doc, onSnapshot } from '@react-native-firebase/firestore';
import { firestore } from '../../firebase-setup';
import { logException } from '../util/logging';

export const claimsUpdatesCollection = collection(firestore, 'claims-updates');

type StampValue =
  | { toMillis?: () => number; seconds?: number; _seconds?: number }
  | Date
  | null
  | undefined;

/** Milliseconds of a Firestore Timestamp in any of the shapes the SDK returns, else undefined. */
export function stampMillis(value: StampValue): number | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  const seconds = value.seconds ?? value._seconds;
  return typeof seconds === 'number' ? seconds * 1000 : undefined;
}

export interface ClaimsWatchDeps {
  /** When the app's current ID token was issued (ms), or undefined if unknown. */
  tokenIssuedAtMs: () => Promise<number | undefined>;
  /** Force-refreshes the token and whatever reads its claims. */
  refresh: () => Promise<void>;
}

/**
 * Refreshes once for each stamp newer than the token the app held when it first
 * saw a stamp, then once per newer stamp. Refreshes run one at a time. Returns
 * the unsubscribe function.
 */
export function watchClaimsUpdates(uid: string, deps: ClaimsWatchDeps): () => void {
  let handledMs: number | undefined;
  let queue: Promise<void> = Promise.resolve();

  const handle = async (stampMs: number) => {
    if (handledMs === undefined) handledMs = (await deps.tokenIssuedAtMs()) ?? 0;
    if (stampMs <= handledMs) return;
    handledMs = stampMs;
    await deps.refresh();
  };

  return onSnapshot(
    doc(claimsUpdatesCollection, uid),
    (snapshot) => {
      const stampMs = stampMillis(snapshot.exists() ? snapshot.data()?.updatedAt : undefined);
      if (stampMs === undefined) return;
      queue = queue
        .then(() => handle(stampMs))
        .catch((error) => {
          logException(error);
        });
    },
    (error) => logException(error),
  );
}
