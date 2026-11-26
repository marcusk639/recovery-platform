import { useMutation } from '@tanstack/react-query';
import { previewRentCharges, RentPreview, RentFrequency } from '../../services/rentCharges';
import { Dollars } from '../../util/money';
import { logException } from '../../util/logging';

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
