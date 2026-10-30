/**
 * useLiveHouseDisputes — the house's open disputes, from
 * house-disputes/{houseId}.
 *
 * That doc is written only by the onActivityWritten Cloud Function and is the
 * authoritative live list. houses/{id}.disputes is a legacy mirror kept for
 * older app builds; admins can rewrite it (house setup saves whole-house
 * copies), so the app no longer reads it for disputes.
 */
import { useCallback, useEffect, useState } from 'react';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { firestore } from '../../firebase-setup';
import { Dispute } from '../entities/Dispute';
import { logException } from '../util/logging';

export const LIVE_DISPUTES = 'house-disputes';

export interface LiveHouseDisputes {
  disputes: { [key: string]: Dispute };
  /** Set when the list could not be read; disputes is then empty, not "none". */
  error: Error | null;
  /** Subscribes again (e.g. a "Try again" button after an error). */
  retry: () => void;
}

export function useLiveHouseDisputes(houseId: string | undefined): LiveHouseDisputes {
  const [disputes, setDisputes] = useState<{ [key: string]: Dispute }>({});
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    setDisputes({});
    setError(null);
    if (!houseId) {
      return;
    }
    const unsubscribe = firestore
      .collection(LIVE_DISPUTES)
      .doc(houseId)
      .onSnapshot(
        (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
          const data = snapshot.exists() ? snapshot.data() : undefined;
          setDisputes((data?.disputes ?? {}) as { [key: string]: Dispute });
          setError(null);
        },
        (err: Error) => {
          logException(err);
          setDisputes({});
          setError(err);
        },
      );
    return () => unsubscribe();
  }, [houseId, attempt]);

  return { disputes, error, retry };
}
