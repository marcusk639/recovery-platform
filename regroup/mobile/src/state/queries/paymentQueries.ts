/**
 * Payment Query Hooks
 *
 * React Query hooks for guest rent payment operations.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as paymentService from '../../services/payments';
import { RentPayment, listHousePayments } from '../../services/payments';
import { logException } from '../../util/logging';
import { Guest } from '../../entities/Guest';
import { toDateSafe } from '../../util/firestore';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const paymentKeys = {
  all: ['payments'] as const,
  history: (guestId: string) =>
    [...paymentKeys.all, 'history', guestId] as const,
  housePayments: (houseId: string) =>
    [...paymentKeys.all, 'house', houseId] as const,
  guestBalances: (houseId: string) =>
    [...paymentKeys.all, 'guest-balances', houseId] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch payment history for a guest.
 *
 * @param guestId - The guest whose payment history to fetch
 * @param enabled - Whether to run the query (default: true)
 */
export const usePaymentHistory = (guestId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: paymentKeys.history(guestId),
    queryFn: () => paymentService.getPaymentHistory(guestId),
    enabled: enabled && !!guestId,
    staleTime: 60000, // 1 minute
  });
};

/**
 * Initiate a rent payment.
 * Calls the Cloud Function to create a Stripe Payment Intent, then
 * optimistically records the pending payment in Firestore.
 */
export const useCreateRentPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      guestId,
      houseId,
      amount,
      description,
    }: {
      guestId: string;
      houseId: string;
      amount: number;
      description?: string;
    }) => {
      const intentResult = await paymentService.createRentPaymentIntent(
        guestId,
        houseId,
        amount,
      );
      // Optimistically record the pending payment so history shows immediately
      try {
        await paymentService.recordRentPayment(
          guestId,
          houseId,
          amount,
          description ?? 'Rent Payment',
          intentResult.paymentIntentId,
        );
      } catch (recordError) {
        // Stripe intent was created but Firestore write failed.
        // Attach the intentId so the Sentry event is reconcilable.
        if (recordError instanceof Error) {
          (recordError as any).paymentIntentId = intentResult.paymentIntentId;
        }
        throw recordError;
      }
      return intentResult;
    },

    onError: error => {
      // Surface a detailed record to Sentry without swallowing the error —
      // the mutation's caller still receives the rejection and can show UI.
      logException(error);
    },
    onSettled: (_data, _error, { guestId, houseId }) => {
      // Invalidate both the guest's own history and the house-level balance
      // dashboard so a new pending row (or a rolled-back one) is reflected
      // everywhere the data is shown.
      queryClient.invalidateQueries({ queryKey: paymentKeys.history(guestId) });
      queryClient.invalidateQueries({
        queryKey: paymentKeys.guestBalances(houseId),
      });
    },
  });
};

// ─── Guest Balances ───────────────────────────────────────────────────────────

export interface GuestBalance {
  guestId: string;
  guestName: string;
  rentOwed: number;
  choreFees: number;
  totalBalance: number;
  totalPaid: number;
  lastPaymentDate: string | null;
  status: 'overdue' | 'current';
}

/**
 * Aggregate per-resident balance data for a house.
 *
 * @param houseId - The house whose payments to fetch
 * @param guests  - Array of guest objects from Redux state
 */
export function useGuestBalances(houseId: string, guests: Guest[]) {
  return useQuery({
    queryKey: [...paymentKeys.guestBalances(houseId), ...guests.map(g => g.id)],
    queryFn: async (): Promise<GuestBalance[]> => {
      const payments = await listHousePayments(houseId, 500);
      return guests.map(guest => {
        const guestPayments = payments.filter(
          (p: any) => p.guestId === guest.id,
        );
        const totalPaid = guestPayments
          .filter((p: any) => p.status === 'succeeded')
          .reduce((sum: number, p: any) => sum + p.amount, 0);
        const sortedByDate = [...guestPayments].sort((a: any, b: any) => {
          const da = toDateSafe(a.createdAt)?.getTime() ?? 0;
          const db = toDateSafe(b.createdAt)?.getTime() ?? 0;
          return db - da;
        });
        const lastPaymentDate =
          sortedByDate.length > 0
            ? toDateSafe(sortedByDate[0].createdAt)?.toISOString() ?? null
            : null;
        const owed = (guest.rentOwed || 0) + (guest.choreFees || 0);
        const totalBalance = Math.max(0, owed - totalPaid);
        return {
          guestId: guest.id,
          guestName:
            guest.displayName || `${guest.firstName} ${guest.lastName}`,
          rentOwed: guest.rentOwed || 0,
          choreFees: guest.choreFees || 0,
          totalBalance,
          totalPaid,
          lastPaymentDate,
          status:
            totalBalance > 0 ? ('overdue' as const) : ('current' as const),
        };
      });
    },
    enabled: !!houseId && guests.length > 0,
    staleTime: 30000,
  });
}

// ─── Failed Payments ──────────────────────────────────────────────────────────

export const useFailedPayments = (houseId: string) =>
  useQuery({
    queryKey: [...paymentKeys.housePayments(houseId), 'failed'],
    queryFn: async (): Promise<RentPayment[]> => {
      const all = await listHousePayments(houseId, 100);
      return all.filter(p => p.status === 'failed');
    },
    enabled: !!houseId,
    staleTime: 30_000,
  });

// ─── Stale Pending Payments ───────────────────────────────────────────────────

/** Payments stuck in `pending` for more than 24 hours — likely a missed webhook. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export const useStalePendingPayments = (houseId: string) =>
  useQuery({
    queryKey: [...paymentKeys.housePayments(houseId), 'stale-pending'],
    queryFn: async (): Promise<RentPayment[]> => {
      const all = await listHousePayments(houseId, 100);
      const cutoff = Date.now() - STALE_THRESHOLD_MS;
      return all.filter(
        p => p.status === 'pending' && new Date(p.createdAt).getTime() < cutoff,
      );
    },
    enabled: !!houseId,
    staleTime: 30_000,
  });

// ─── Resolve Failed Payment (offline) ────────────────────────────────────────

/**
 * Mark a failed payment as resolved offline.
 * Updates the payment's status to 'resolved_offline' in Firestore
 * and invalidates the failed payments list for the given house.
 *
 * @param houseId - The house ID (used to invalidate the failed payments query)
 * @returns A mutation hook for resolving payments
 */
export const useMarkPaymentResolved = (houseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ paymentId }: { paymentId: string }) =>
      paymentService.markPaymentResolvedOffline(paymentId),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [...paymentKeys.housePayments(houseId), 'failed'],
      });
    },
    onError: error => {
      logException(error);
    },
  });
};
