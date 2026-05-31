/**
 * Staff Notes Query Hooks
 *
 * React Query hooks for admin-only staff notes (resident notes + shift logs).
 * Reads use useQuery; writes use useMutation with logException + cache
 * invalidation in onSettled (mirrors paymentQueries.ts).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as staffNotesService from '../../services/staffNotes';
import { StaffNote, StaffNoteType } from '../../entities/StaffNote';
import { logException } from '../../util/logging';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const staffNoteKeys = {
  all: ['staffNotes'] as const,
  resident: (houseId: string, guestId: string) =>
    [...staffNoteKeys.all, 'resident', houseId, guestId] as const,
  shiftLog: (houseId: string) =>
    [...staffNoteKeys.all, 'shiftLog', houseId] as const,
};

// ─── Reads ────────────────────────────────────────────────────────────────────

/** Fetch all resident notes for a specific guest in a house. */
export const useResidentNotes = (
  houseId: string,
  guestId: string,
  enabled: boolean = true,
) =>
  useQuery({
    queryKey: staffNoteKeys.resident(houseId, guestId),
    queryFn: () => staffNotesService.listResidentNotes(houseId, guestId),
    enabled: enabled && !!houseId && !!guestId,
    staleTime: 30_000,
  });

/** Fetch all shift-log notes for a house. */
export const useShiftLogs = (houseId: string, enabled: boolean = true) =>
  useQuery({
    queryKey: staffNoteKeys.shiftLog(houseId),
    queryFn: () => staffNotesService.listShiftLogs(houseId),
    enabled: enabled && !!houseId,
    staleTime: 30_000,
  });

// ─── Mutations ────────────────────────────────────────────────────────────────

interface AddNoteVariables {
  type: StaffNoteType;
  content: string;
  guestId?: string;
}

/**
 * Add a staff note. Invalidates both possible caches (resident + shiftLog)
 * for the given houseId on settle so whichever feed is mounted refreshes.
 */
export const useAddStaffNote = (houseId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: AddNoteVariables) =>
      staffNotesService.addStaffNote({
        houseId,
        type: vars.type,
        content: vars.content,
        guestId: vars.guestId,
      }),
    onError: error => {
      logException(error);
    },
    onSettled: (_data, _err, vars) => {
      if (vars.type === 'resident_note' && vars.guestId) {
        queryClient.invalidateQueries({
          queryKey: staffNoteKeys.resident(houseId, vars.guestId),
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: staffNoteKeys.shiftLog(houseId),
        });
      }
    },
  });
};

interface DeleteNoteVariables {
  noteId: string;
  /** Provide to invalidate the resident feed; omit for shift_log. */
  guestId?: string;
}

export const useDeleteStaffNote = (houseId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: DeleteNoteVariables) =>
      staffNotesService.deleteStaffNote(vars.noteId),
    onError: error => {
      logException(error);
    },
    onSettled: (_data, _err, vars) => {
      if (vars?.guestId) {
        queryClient.invalidateQueries({
          queryKey: staffNoteKeys.resident(houseId, vars.guestId),
        });
      }
      queryClient.invalidateQueries({
        queryKey: staffNoteKeys.shiftLog(houseId),
      });
    },
  });
};

interface PinNoteVariables {
  noteId: string;
  pinned: boolean;
  guestId?: string;
}

export const usePinStaffNote = (houseId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: PinNoteVariables) =>
      staffNotesService.pinStaffNote(vars.noteId, vars.pinned),
    onError: error => {
      logException(error);
    },
    onSettled: (_data, _err, vars) => {
      if (vars?.guestId) {
        queryClient.invalidateQueries({
          queryKey: staffNoteKeys.resident(houseId, vars.guestId),
        });
      }
      queryClient.invalidateQueries({
        queryKey: staffNoteKeys.shiftLog(houseId),
      });
    },
  });
};

// Re-export the StaffNote type for convenience.
export type { StaffNote };
