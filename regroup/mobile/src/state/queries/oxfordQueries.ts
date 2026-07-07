/**
 * Oxford House React Query Hooks
 *
 * Provides data-fetching and mutation hooks for all Oxford House domain entities.
 * Follows the same patterns as activityQueries.ts and guestQueries.ts.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as oxfordService from "../../services/oxford";
import {
  getVotes as getHouseVotes,
  createVote as createHouseVote,
  castVote as castHouseVote,
} from "../../services/oxford/votes";
import {
  getEESRecords,
  getEESRecordsForRecentWeeks,
  markEESPaid,
  createEESRecords,
} from "../../services/oxford/ees";
import { logException } from "../../util/logging";
import {
  Officer,
  BusinessMeeting,
  Vote,
  Election,
  EESTransaction,
  FinancialRecord,
} from "../../entities/oxford";

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const oxfordKeys = {
  all: ["oxford"] as const,

  officers: () => [...oxfordKeys.all, "officers"] as const,
  officersByHouse: (houseId: string) =>
    [...oxfordKeys.officers(), houseId] as const,

  meetings: () => [...oxfordKeys.all, "meetings"] as const,
  meetingsByHouse: (houseId: string) =>
    [...oxfordKeys.meetings(), houseId] as const,
  meetingVotes: (meetingId: string) =>
    [...oxfordKeys.meetings(), "votes", meetingId] as const,

  elections: () => [...oxfordKeys.all, "elections"] as const,
  electionsByHouse: (houseId: string) =>
    [...oxfordKeys.elections(), houseId] as const,

  eesTransactions: () => [...oxfordKeys.all, "eesTransactions"] as const,
  eesTransactionsByHouse: (houseId: string) =>
    [...oxfordKeys.eesTransactions(), houseId] as const,

  eesRecords: () => [...oxfordKeys.all, "eesRecords"] as const,
  eesRecordsByHouseWeek: (houseId: string, weekStart: string) =>
    [...oxfordKeys.eesRecords(), houseId, weekStart] as const,
  eesRecordsByHouseRecent: (houseId: string, weekCount: number) =>
    [...oxfordKeys.eesRecords(), houseId, "recent", weekCount] as const,

  votes: () => [...oxfordKeys.all, "votes"] as const,
  votesByHouse: (houseId: string) => [...oxfordKeys.votes(), houseId] as const,

  financialRecords: () => [...oxfordKeys.all, "financialRecords"] as const,
  financialRecordsByHouse: (houseId: string) =>
    [...oxfordKeys.financialRecords(), houseId] as const,
};

// ─── Officers ────────────────────────────────────────────────────────────────

/**
 * Fetch all officers (active + inactive) for a house.
 */
export const useOfficers = (houseId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: oxfordKeys.officersByHouse(houseId),
    queryFn: () => oxfordService.getOfficers(houseId),
    enabled: enabled && !!houseId,
    staleTime: 60000, // 1 minute
  });
};

/**
 * Create a new officer for a house.
 */
export const useCreateOfficer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (officer: Omit<Officer, "id">) =>
      oxfordService.createOfficer(officer),

    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: oxfordKeys.officersByHouse(data.houseId),
      });
    },
  });
};

/**
 * Update an existing officer record.
 */
export const useUpdateOfficer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates,
      houseId,
    }: {
      id: string;
      updates: Partial<Officer>;
      houseId: string;
    }) => oxfordService.updateOfficer(id, { ...updates, houseId }),

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: oxfordKeys.officersByHouse(variables.houseId),
      });
    },
  });
};

/**
 * Remove (delete) an officer record.
 */
export const useRemoveOfficer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, houseId }: { id: string; houseId: string }) =>
      oxfordService.removeOfficer(id, houseId),

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: oxfordKeys.officersByHouse(variables.houseId),
      });
    },
  });
};

// ─── Business Meetings ────────────────────────────────────────────────────────

/**
 * Fetch business meetings for a house, most recent first.
 */
export const useBusinessMeetings = (
  houseId: string,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: oxfordKeys.meetingsByHouse(houseId),
    queryFn: () => oxfordService.getBusinessMeetings(houseId),
    enabled: enabled && !!houseId,
    staleTime: 30000, // 30 seconds
  });
};

/**
 * Fetch all votes associated with a specific meeting.
 */
export const useMeetingVotes = (meetingId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: oxfordKeys.meetingVotes(meetingId),
    queryFn: () => oxfordService.getVotesForMeeting(meetingId),
    enabled: enabled && !!meetingId,
    // Votes are governance-immutable once cast — 60s matches other
    // house-level entities and avoids unnecessary refetches.
    staleTime: 60_000,
  });
};

/**
 * Create a new business meeting.
 * Includes optimistic update that prepends the new meeting to the cached list.
 */
export const useCreateBusinessMeeting = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (meeting: Omit<BusinessMeeting, "id">) =>
      oxfordService.createBusinessMeeting(meeting),

    // Optimistic update: insert a temporary meeting at the top of the list
    onMutate: async (newMeeting) => {
      const queryKey = oxfordKeys.meetingsByHouse(newMeeting.houseId);
      await queryClient.cancelQueries({ queryKey });

      const previousMeetings =
        queryClient.getQueryData<BusinessMeeting[]>(queryKey) ?? [];

      const optimisticMeeting: BusinessMeeting = {
        ...newMeeting,
        id: `temp_${Date.now()}`,
      };

      queryClient.setQueryData(queryKey, [
        optimisticMeeting,
        ...previousMeetings,
      ]);

      return { previousMeetings };
    },

    onError: (_err, newMeeting, context) => {
      if (context?.previousMeetings) {
        queryClient.setQueryData(
          oxfordKeys.meetingsByHouse(newMeeting.houseId),
          context.previousMeetings
        );
      }
    },

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: oxfordKeys.meetingsByHouse(variables.houseId),
      });
    },
  });
};

/**
 * Update an existing business meeting (e.g. add minutes, mark completed).
 */
export const useUpdateBusinessMeeting = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates,
      houseId,
    }: {
      id: string;
      updates: Partial<BusinessMeeting>;
      houseId: string;
    }) => oxfordService.updateBusinessMeeting(id, { ...updates, houseId }),

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: oxfordKeys.meetingsByHouse(variables.houseId),
      });
    },
  });
};

// ─── Votes / Ballots ──────────────────────────────────────────────────────────
//
// NOTE: useCastVote() used to live here, calling oxfordService.castVote()
// (services/oxford/index.ts). Removed 2026-07-04 as dead-code cleanup — no
// screen ever called this hook (confirmed by searching every call site;
// only its own tests did), and the function it called didn't respect a
// vote's `isAnonymous` flag. The real, live vote-casting path is
// useCastHouseVote() below, which does respect it. See services/oxford/
// index.ts for the full removal note.

/**
 * Fetch all votes for a house (subcollection-based).
 */
export const useHouseVotes = (houseId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: oxfordKeys.votesByHouse(houseId),
    queryFn: () => getHouseVotes(houseId),
    enabled: enabled && !!houseId,
    // 30s matches other governance-entity queries; votes change on
    // cast/create which invalidates the cache explicitly.
    staleTime: 30_000,
  });
};

/**
 * Create a new vote in the house subcollection.
 */
export const useCreateHouseVote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      houseId,
      vote,
    }: {
      houseId: string;
      vote: Omit<Vote, "id">;
    }) => createHouseVote(houseId, vote),

    onError: (error) => logException(error),
    onSettled: (_data, _error, { houseId }) => {
      queryClient.invalidateQueries({
        queryKey: oxfordKeys.votesByHouse(houseId),
      });
    },
  });
};

/**
 * Cast a vote on a specific vote document (subcollection transaction).
 */
export const useCastHouseVote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      houseId,
      voteId,
      guestId,
      choice,
    }: {
      houseId: string;
      voteId: string;
      guestId: string;
      choice: "yes" | "no" | "abstain";
    }) => castHouseVote(houseId, voteId, guestId, choice),

    onError: (error) => logException(error),
    onSettled: (_data, _error, { houseId }) => {
      queryClient.invalidateQueries({
        queryKey: oxfordKeys.votesByHouse(houseId),
      });
    },
  });
};

// ─── Elections ────────────────────────────────────────────────────────────────

/**
 * Fetch all elections for a house.
 */
export const useElections = (houseId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: oxfordKeys.electionsByHouse(houseId),
    queryFn: () => oxfordService.getElections(houseId),
    enabled: enabled && !!houseId,
    staleTime: 60000,
  });
};

/**
 * Create a new election.
 */
export const useCreateElection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (election: Omit<Election, "id">) =>
      oxfordService.createElection(election),

    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: oxfordKeys.electionsByHouse(data.houseId),
      });
    },
  });
};

// ─── EES Transactions ─────────────────────────────────────────────────────────

/**
 * Fetch EES transactions for a house.
 */
export const useEESTransactions = (
  houseId: string,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: oxfordKeys.eesTransactionsByHouse(houseId),
    queryFn: () => oxfordService.getEESTransactions(houseId),
    enabled: enabled && !!houseId,
    staleTime: 30000,
  });
};

/**
 * Create a new EES transaction.
 */
export const useCreateEESTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tx: Omit<EESTransaction, "id">) =>
      oxfordService.createEESTransaction(tx),

    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: oxfordKeys.eesTransactionsByHouse(data.houseId),
      });
    },
  });
};

// ─── EES Records (weekly per-guest share) ─────────────────────────────────────

/**
 * Fetch EES records (per-guest weekly share rows) for a house and week.
 */
export const useEESRecords = (
  houseId: string,
  weekStart: string,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: oxfordKeys.eesRecordsByHouseWeek(houseId, weekStart),
    queryFn: () => getEESRecords(houseId, weekStart),
    enabled: enabled && !!houseId && !!weekStart,
    staleTime: 30_000,
  });
};

/**
 * Fetch EES records across the most recent N weeks (for compliance reporting).
 */
export const useEESRecordsRecent = (
  houseId: string,
  weekCount: number,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: oxfordKeys.eesRecordsByHouseRecent(houseId, weekCount),
    queryFn: () => getEESRecordsForRecentWeeks(houseId, weekCount),
    enabled: enabled && !!houseId,
    staleTime: 60_000,
  });
};

/**
 * Mark a single EES record as paid.
 */
export const useMarkEESPaid = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      recordId,
    }: {
      recordId: string;
      houseId: string;
      weekStart: string;
    }) => markEESPaid(recordId),

    onError: (error) => logException(error),
    onSettled: (_data, _error, { houseId, weekStart }) => {
      queryClient.invalidateQueries({
        queryKey: oxfordKeys.eesRecordsByHouseWeek(houseId, weekStart),
      });
    },
  });
};

/**
 * Create a batch of EES records for a week.
 */
export const useCreateEESRecords = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      houseId,
      weekStart,
      guestIds,
      amountPerGuest,
    }: {
      houseId: string;
      weekStart: string;
      guestIds: string[];
      amountPerGuest: number;
    }) => createEESRecords(houseId, weekStart, guestIds, amountPerGuest),

    onError: (error) => logException(error),
    onSettled: (_data, _error, { houseId, weekStart }) => {
      queryClient.invalidateQueries({
        queryKey: oxfordKeys.eesRecordsByHouseWeek(houseId, weekStart),
      });
    },
  });
};

// ─── Financial Records ────────────────────────────────────────────────────────

/**
 * Fetch financial records for a house.
 */
export const useFinancialRecords = (
  houseId: string,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: oxfordKeys.financialRecordsByHouse(houseId),
    queryFn: () => oxfordService.getFinancialRecords(houseId),
    enabled: enabled && !!houseId,
    staleTime: 60000,
  });
};

/**
 * Create a new financial record.
 */
export const useCreateFinancialRecord = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (record: Omit<FinancialRecord, "id">) =>
      oxfordService.createFinancialRecord(record),

    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: oxfordKeys.financialRecordsByHouse(data.houseId),
      });
    },
  });
};
