import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PartialHouseWithId } from '../../entities/House';
import { Dispute } from '../../entities/Dispute';
import { updateDispute } from '../../services/dispute';

interface UpdateDisputeParams {
  house: PartialHouseWithId;
  resolvedDispute?: Dispute;
}

export const useUpdateDispute = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateDisputeParams) => {
      return updateDispute(params.house, params.resolvedDispute);
    },
    onSuccess: () => {
      // Invalidate relevant queries after dispute update
      queryClient.invalidateQueries({ queryKey: ['guests'] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
    },
  });
};
