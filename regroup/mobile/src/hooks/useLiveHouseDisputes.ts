/**
 * useLiveHouseDisputes — the house's open disputes, from
 * house-disputes/{houseId}.
 *
 * That doc is written only by the onActivityWritten Cloud Function and is the
 * authoritative live list. houses/{id}.disputes is a legacy mirror kept for
 * older app builds; admins can rewrite it (house setup saves whole-house
 * copies), so the app no longer reads it for disputes.
 */
import { useEffect, useState } from 'react';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { firestore } from '../../firebase-setup';
import { Dispute } from '../entities/Dispute';
import { logException } from '../util/logging';

export const LIVE_DISPUTES = 'house-disputes';

export function useLiveHouseDisputes(houseId: string | undefined): {
  [key: string]: Dispute;
} {
  const [disputes, setDisputes] = useState<{ [key: string]: Dispute }>({});

  useEffect(() => {
    setDisputes({});
    if (!houseId) {
      return;
    }
    const unsubscribe = firestore
      .collection(LIVE_DISPUTES)
      .doc(houseId)
      .onSnapshot(
        (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
          const data = snapshot.exists ? snapshot.data() : undefined;
          setDisputes((data?.disputes ?? {}) as { [key: string]: Dispute });
        },
        (err: Error) => {
          logException(err);
          setDisputes({});
        },
      );
    return () => unsubscribe();
  }, [houseId]);

  return disputes;
}
