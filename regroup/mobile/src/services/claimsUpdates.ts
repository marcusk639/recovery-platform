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

/** How long to wait before retrying a refresh that failed (offline, say). */
export const CLAIMS_REFRESH_RETRY_MS = 30_000;

/**
 * Refreshes once for each stamp newer than the token the app held when it first
 * saw a stamp, then once per newer stamp. Refreshes run one at a time. A stamp
 * counts as handled only once its refresh succeeds; a failed refresh is retried
 * after CLAIMS_REFRESH_RETRY_MS (or at the next stamp), so a demotion is not
 * lost to a flaky connection. Returns the unsubscribe function.
 */
export function watchClaimsUpdates(uid: string, deps: ClaimsWatchDeps): () => void {
  let handledMs: number | undefined;
  let latestMs: number | undefined;
  let queue: Promise<void> = Promise.resolve();
  let retry: ReturnType<typeof setTimeout> | undefined;
  let active = true;

  const handle = async () => {
    const stampMs = latestMs;
    if (!active || stampMs === undefined) return;
    if (handledMs === undefined) handledMs = (await deps.tokenIssuedAtMs()) ?? 0;
    if (stampMs <= handledMs) return;
    await deps.refresh();
    handledMs = Math.max(handledMs, stampMs);
  };

  const enqueue = () => {
    if (retry) clearTimeout(retry);
    retry = undefined;
    queue = queue.then(handle).catch((error) => {
      logException(error);
      if (active) retry = setTimeout(enqueue, CLAIMS_REFRESH_RETRY_MS);
    });
  };

  const unsubscribe = onSnapshot(
    doc(claimsUpdatesCollection, uid),
    (snapshot) => {
      const stampMs = stampMillis(snapshot.exists() ? snapshot.data()?.updatedAt : undefined);
      if (stampMs === undefined) return;
      latestMs = Math.max(latestMs ?? 0, stampMs);
      enqueue();
    },
    (error) => logException(error),
  );

  return () => {
    active = false;
    if (retry) clearTimeout(retry);
    unsubscribe();
  };
}
