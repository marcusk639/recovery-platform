import { useEffect, useState } from 'react';
import { getGuestPayments, getPaymentHistory, RentPayment } from '../../services/payments';
import { logException } from '../../util/logging';

export const PAYMENT_HISTORY_LOAD_ERROR = "Couldn't load payment history. Please try again.";

type GuestRef = { id?: string; userId?: string } | null | undefined;
type HouseRef = { id?: string } | null | undefined;

/**
 * Payment History's records for the selected resident.
 *
 * Firestore is the history of record (owner decision D4). The rules let a
 * resident list only by their own uid. Anyone else here is staff, who need the
 * guest record's full history: cash for a resident with no account, and
 * payments from before the account linked, carry no uid.
 *
 * Until the resident's record and the house load there is nothing to query;
 * once loaded, a missing one is an error, not an empty history. A failed read
 * goes to Sentry and shows a plain message, never the raw Firebase text.
 */
export function usePaymentHistoryRecords(
  guest: GuestRef,
  house: HouseRef,
  signedInUid: string | undefined,
  selectionLoading: boolean,
): { payments: RentPayment[]; loading: boolean; error: string | null } {
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const guestId = guest?.id;
  const guestUserId = guest?.userId;
  const houseId = house?.id;

  useEffect(() => {
    if (selectionLoading) {
      setLoading(true);
      return;
    }
    if (!guestId || !houseId) {
      setError(PAYMENT_HISTORY_LOAD_ERROR);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    const fetchPayments = async () => {
      try {
        const data =
          guestUserId && guestUserId === signedInUid
            ? await getPaymentHistory({ houseId, guestUserId })
            : await getGuestPayments({ houseId, guestId });
        if (active) setPayments(data);
      } catch (err) {
        logException(err);
        if (active) setError(PAYMENT_HISTORY_LOAD_ERROR);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchPayments();
    return () => {
      active = false;
    };
  }, [guestId, guestUserId, houseId, signedInUid, selectionLoading]);

  return { payments, loading, error };
}
