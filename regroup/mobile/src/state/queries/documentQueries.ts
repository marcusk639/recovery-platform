import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
  getExpiringDocuments,
  UploadDocumentInput,
} from '../../services/documents';
import { logException } from '../../util/logging';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const documentKeys = {
  all: ['documents'] as const,
  list: (houseId: string, guestId?: string) =>
    [...documentKeys.all, 'list', houseId, guestId ?? 'house'] as const,
  expiring: (houseId: string) =>
    [...documentKeys.all, 'expiring', houseId] as const,
};

// ─── Query hooks ──────────────────────────────────────────────────────────────

/**
 * List documents for a house or a specific resident within that house.
 * Pass `guestId` to scope to a single resident; omit for house-level docs.
 */
export function useDocuments(houseId: string, guestId?: string) {
  return useQuery({
    queryKey: documentKeys.list(houseId, guestId),
    queryFn: () => listDocuments(houseId, guestId),
    enabled: !!houseId,
    staleTime: 30000,
  });
}

/**
 * Return all documents expiring within 30 days for a house.
 * Used to drive the admin expiry badge.
 */
export function useExpiringDocuments(houseId: string) {
  return useQuery({
    queryKey: documentKeys.expiring(houseId),
    queryFn: () => getExpiringDocuments(houseId),
    enabled: !!houseId,
    staleTime: 60000,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Upload a new document.
 *
 * On success, invalidates both the list and expiring queries for the house so
 * the UI reflects the newly uploaded document immediately.
 */
export function useUploadDocument(houseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadDocumentInput) => uploadDocument(input),
    onError: (error: unknown) => {
      logException(error);
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentKeys.list(houseId, variables.guestId),
      });
      queryClient.invalidateQueries({
        queryKey: documentKeys.expiring(houseId),
      });
    },
  });
}

/**
 * Delete a document by Firestore id + storage path.
 *
 * Caller must pass `guestId` (or leave undefined) so we can invalidate the
 * correct list cache entry.
 */
export function useDeleteDocument(houseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      storagePath,
    }: {
      docId: string;
      storagePath: string;
      guestId?: string;
    }) => deleteDocument(docId, storagePath),
    onError: (error: unknown) => {
      logException(error);
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentKeys.list(houseId, variables.guestId),
      });
      queryClient.invalidateQueries({
        queryKey: documentKeys.expiring(houseId),
      });
    },
  });
}
