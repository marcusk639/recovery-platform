import { useMutation, useQuery } from '@tanstack/react-query';
import {
  listGuestCharges,
  previewRentCharges,
  RentPreview,
  RentFrequency,
} from '../../services/rentCharges';
import { Dollars } from '../../util/money';
import { logException } from '../../util/logging';

export const rentChargeKeys = {
  all: ['rentCharges'] as const,
  forResident: (houseId: string | undefined, guestUserId: string | undefined) =>
    [...rentChargeKeys.all, 'resident', houseId, guestUserId] as const,
};

/**
 * The signed-in resident's own rent charges, newest first: by house and their own
 * uid, the only list the rentCharges rule allows a resident (services/rentCharges).
 */
export const useResidentCharges = (
  { houseId, guestUserId }: { houseId?: string; guestUserId?: string },
  enabled: boolean = true,
) =>
  useQuery({
    queryKey: rentChargeKeys.forResident(houseId, guestUserId),
    queryFn: () => listGuestCharges({ houseId: houseId as string, guestUserId }),
    enabled: enabled && !!houseId && !!guestUserId,
    staleTime: 60000,
  });

/**
 * The turn-on preview, asked for when the manager presses Preview. A mutation
 * because it is an on-demand read of what a save would do, not cached data.
 */
export const useRentPreview = () =>
  useMutation<RentPreview, Error, { houseId: string; frequency: RentFrequency; price: Dollars }>({
    mutationFn: previewRentCharges,
    onError: (error) => {
      // A peer leader is refused by design; the screen doesn't offer it to them.
      if (!String((error as { code?: string }).code ?? '').includes('permission-denied')) {
        logException(error);
      }
    },
  });
