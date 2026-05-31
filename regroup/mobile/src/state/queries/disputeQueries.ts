import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PartialGuestWithId } from '../../entities/Guest';
import { PartialHouseWithId } from '../../entities/House';
import { Dispute } from '../../entities/Dispute';
import { Notification } from '../../entities/Notification';
import { updateDispute } from '../../services/dispute';

interface UpdateDisputeParams {
  guest: PartialGuestWithId;
  house: PartialHouseWithId;
  notifications: Notification[];
  resolvedDispute?: Dispute;
}

export const useUpdateDispute = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateDisputeParams) => {
      return updateDispute(
        params.house,
        params.guest,
        params.notifications,
        params.resolvedDispute,
      );
    },
    onSuccess: () => {
      // Invalidate relevant queries after dispute update
      queryClient.invalidateQueries({ queryKey: ['guests'] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
    },
  });
};
