// src/state/queries/__tests__/oxfordQueries.test.ts
//
// Unit tests for the Oxford House React Query hooks in oxfordQueries.ts.
// Covers all query hooks (useOfficers, useBusinessMeetings, useMeetingVotes,
// useElections, useEESTransactions, useFinancialRecords) and all mutation
// hooks (useCreateOfficer, useUpdateOfficer, useRemoveOfficer,
// useCreateBusinessMeeting, useUpdateBusinessMeeting, useCastVote,
// useCreateElection, useCreateEESTransaction, useCreateFinancialRecord).

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the oxford service module before importing the hooks.
// The service creates collection refs at import time from firebase-setup, so
// the firebase-setup mock (via __mocks__/firebase-setup.js) handles that layer.
// We mock the service directly so individual functions can be jest.Mock targets.
jest.mock('../../../services/oxford');

import * as oxfordService from '../../../services/oxford';
import {
  oxfordKeys,
  useOfficers,
  useCreateOfficer,
  useUpdateOfficer,
  useRemoveOfficer,
  useBusinessMeetings,
  useMeetingVotes,
  useCreateBusinessMeeting,
  useUpdateBusinessMeeting,
  useCastVote,
  useElections,
  useCreateElection,
  useEESTransactions,
  useCreateEESTransaction,
  useFinancialRecords,
  useCreateFinancialRecord,
} from '../oxfordQueries';
import type {
  Officer,
  BusinessMeeting,
  Vote,
  Election,
  EESTransaction,
  FinancialRecord,
} from '../../../entities/oxford';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeOfficer = (overrides: Partial<Officer> = {}): Officer => ({
  id: 'officer1',
  houseId: 'house1',
  userId: 'user1',
  role: 'president',
  termStartDate: '2026-01-01',
  termEndDate: '2026-07-01',
  isActive: true,
  electedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeMeeting = (
  overrides: Partial<BusinessMeeting> = {},
): BusinessMeeting => ({
  id: 'meeting1',
  houseId: 'house1',
  scheduledDate: '2026-01-15',
  agenda: [],
  attendees: ['user1', 'user2'],
  quorumMet: true,
  createdBy: 'user1',
  createdAt: '2026-01-10T00:00:00.000Z',
  ...overrides,
});

const makeVote = (overrides: Partial<Vote> = {}): Vote => ({
  id: 'vote1',
  houseId: 'house1',
  meetingId: 'meeting1',
  topic: 'House rule change',
  description: 'Update quiet hours',
  type: 'general',
  options: ['Yes', 'No', 'Abstain'],
  results: { Yes: 3, No: 1, Abstain: 0 },
  individualVotes: { user1: 'Yes', user2: 'Yes' },
  threshold: 0.5,
  passed: true,
  createdAt: '2026-01-15T18:30:00.000Z',
  ...overrides,
});

const makeElection = (overrides: Partial<Election> = {}): Election => ({
  id: 'election1',
  houseId: 'house1',
  role: 'president',
  candidates: [{ userId: 'user1', nominatedBy: 'user2' }],
  voteId: 'vote1',
  termStartDate: '2026-01-01',
  termEndDate: '2026-07-01',
  conductedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeTransaction = (
  overrides: Partial<EESTransaction> = {},
): EESTransaction => ({
  id: 'tx1',
  houseId: 'house1',
  guestId: 'guest1',
  amount: 150,
  period: '2026-01-05',
  type: 'payment',
  status: 'pending',
  createdAt: '2026-01-05T00:00:00.000Z',
  ...overrides,
});

const makeFinancialRecord = (
  overrides: Partial<FinancialRecord> = {},
): FinancialRecord => ({
  id: 'record1',
  houseId: 'house1',
  period: '2026-01-05',
  totalIncome: 600,
  totalExpenses: 400,
  balance: 200,
  breakdown: [{ category: 'Rent', amount: 400 }],
  submittedBy: 'user1',
  submittedAt: '2026-01-12T00:00:00.000Z',
  approvedByVote: false,
  ...overrides,
});

// ─── Test setup ──────────────────────────────────────────────────────────────

describe('oxfordQueries', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    queryClient.unmount();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  // ── oxfordKeys ────────────────────────────────────────────────────────────

  describe('oxfordKeys', () => {
    it('all is ["oxford"]', () => {
      expect(oxfordKeys.all).toEqual(['oxford']);
    });

    it('officers() returns ["oxford", "officers"]', () => {
      expect(oxfordKeys.officers()).toEqual(['oxford', 'officers']);
    });

    it('officersByHouse embeds houseId', () => {
      const key = oxfordKeys.officersByHouse('house1');
      expect(key).toEqual(['oxford', 'officers', 'house1']);
    });

    it('meetings() returns ["oxford", "meetings"]', () => {
      expect(oxfordKeys.meetings()).toEqual(['oxford', 'meetings']);
    });

    it('meetingsByHouse embeds houseId', () => {
      const key = oxfordKeys.meetingsByHouse('house1');
      expect(key).toEqual(['oxford', 'meetings', 'house1']);
    });

    it('meetingVotes embeds meetingId', () => {
      const key = oxfordKeys.meetingVotes('meeting1');
      expect(key).toEqual(['oxford', 'meetings', 'votes', 'meeting1']);
    });

    it('elections() returns ["oxford", "elections"]', () => {
      expect(oxfordKeys.elections()).toEqual(['oxford', 'elections']);
    });

    it('electionsByHouse embeds houseId', () => {
      const key = oxfordKeys.electionsByHouse('house1');
      expect(key).toEqual(['oxford', 'elections', 'house1']);
    });

    it('eesTransactionsByHouse embeds houseId', () => {
      const key = oxfordKeys.eesTransactionsByHouse('house1');
      expect(key).toContain('house1');
    });

    it('financialRecordsByHouse embeds houseId', () => {
      const key = oxfordKeys.financialRecordsByHouse('house1');
      expect(key).toContain('house1');
    });
  });

  // ── useOfficers ───────────────────────────────────────────────────────────

  describe('useOfficers', () => {
    it('fetches officers and returns them on success', async () => {
      const officers = [makeOfficer()];
      (oxfordService.getOfficers as jest.Mock).mockResolvedValue(officers);

      const { result } = renderHook(() => useOfficers('house1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(officers);
      expect(oxfordService.getOfficers).toHaveBeenCalledWith('house1');
    });

    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(() => useOfficers('house1', false), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(false);
      expect(oxfordService.getOfficers).not.toHaveBeenCalled();
    });

    it('does not fetch when houseId is empty', () => {
      const { result } = renderHook(() => useOfficers(''), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(oxfordService.getOfficers).not.toHaveBeenCalled();
    });

    it('surfaces errors from the service', async () => {
      const error = new Error('Failed to fetch officers');
      (oxfordService.getOfficers as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useOfficers('house1'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('caches data under the correct key', async () => {
      const officers = [makeOfficer()];
      (oxfordService.getOfficers as jest.Mock).mockResolvedValue(officers);

      const { result } = renderHook(() => useOfficers('house1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData(
        oxfordKeys.officersByHouse('house1'),
      );
      expect(cached).toEqual(officers);
    });
  });

  // ── useCreateOfficer ──────────────────────────────────────────────────────

  describe('useCreateOfficer', () => {
    const officerInput: Omit<Officer, 'id'> = {
      houseId: 'house1',
      userId: 'user1',
      role: 'president',
      termStartDate: '2026-01-01',
      termEndDate: '2026-07-01',
      isActive: true,
      electedAt: '2026-01-01T00:00:00.000Z',
    };

    it('calls createOfficer with the correct arguments', async () => {
      const created = makeOfficer();
      (oxfordService.createOfficer as jest.Mock).mockResolvedValue(created);

      const { result } = renderHook(() => useCreateOfficer(), { wrapper });

      result.current.mutate(officerInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(oxfordService.createOfficer).toHaveBeenCalledWith(officerInput);
    });

    it('invalidates officersByHouse on success', async () => {
      const created = makeOfficer();
      (oxfordService.createOfficer as jest.Mock).mockResolvedValue(created);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateOfficer(), { wrapper });

      result.current.mutate(officerInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: oxfordKeys.officersByHouse('house1'),
      });
    });

    it('surfaces errors when the service call fails', async () => {
      const error = new Error('Create officer failed');
      (oxfordService.createOfficer as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useCreateOfficer(), { wrapper });

      result.current.mutate(officerInput);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('starts in idle state', () => {
      const { result } = renderHook(() => useCreateOfficer(), { wrapper });

      expect(result.current.isIdle).toBe(true);
      expect(result.current.isPending).toBe(false);
    });
  });

  // ── useUpdateOfficer ──────────────────────────────────────────────────────

  describe('useUpdateOfficer', () => {
    it('calls updateOfficer with id and updates', async () => {
      (oxfordService.updateOfficer as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useUpdateOfficer(), { wrapper });

      result.current.mutate({
        id: 'officer1',
        updates: { isActive: false },
        houseId: 'house1',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(oxfordService.updateOfficer).toHaveBeenCalledWith('officer1', {
        isActive: false,
        houseId: 'house1',
      });
    });

    it('invalidates officersByHouse for the provided houseId on success', async () => {
      (oxfordService.updateOfficer as jest.Mock).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateOfficer(), { wrapper });

      result.current.mutate({
        id: 'officer1',
        updates: { role: 'treasurer' },
        houseId: 'house1',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: oxfordKeys.officersByHouse('house1'),
      });
    });

    it('does not invalidate queries when the mutation fails', async () => {
      (oxfordService.updateOfficer as jest.Mock).mockRejectedValue(
        new Error('update failed'),
      );

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateOfficer(), { wrapper });

      result.current.mutate({ id: 'officer1', updates: {}, houseId: 'house1' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('surfaces errors when the service call fails', async () => {
      const error = new Error('Officer not found');
      (oxfordService.updateOfficer as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useUpdateOfficer(), { wrapper });

      result.current.mutate({ id: 'missing', updates: {}, houseId: 'house1' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ── useRemoveOfficer ──────────────────────────────────────────────────────

  describe('useRemoveOfficer', () => {
    it('calls removeOfficer with the officer id', async () => {
      (oxfordService.removeOfficer as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useRemoveOfficer(), { wrapper });

      result.current.mutate({ id: 'officer1', houseId: 'house1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(oxfordService.removeOfficer).toHaveBeenCalledWith(
        'officer1',
        'house1',
      );
    });

    it('invalidates officersByHouse on success', async () => {
      (oxfordService.removeOfficer as jest.Mock).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useRemoveOfficer(), { wrapper });

      result.current.mutate({ id: 'officer1', houseId: 'house1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: oxfordKeys.officersByHouse('house1'),
      });
    });

    it('surfaces errors when the service call fails', async () => {
      const error = new Error('Delete failed');
      (oxfordService.removeOfficer as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useRemoveOfficer(), { wrapper });

      result.current.mutate({ id: 'officer1', houseId: 'house1' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ── useBusinessMeetings ───────────────────────────────────────────────────

  describe('useBusinessMeetings', () => {
    it('fetches meetings and returns them on success', async () => {
      const meetings = [makeMeeting()];
      (oxfordService.getBusinessMeetings as jest.Mock).mockResolvedValue(
        meetings,
      );

      const { result } = renderHook(() => useBusinessMeetings('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(meetings);
      expect(oxfordService.getBusinessMeetings).toHaveBeenCalledWith('house1');
    });

    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(
        () => useBusinessMeetings('house1', false),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(oxfordService.getBusinessMeetings).not.toHaveBeenCalled();
    });

    it('does not fetch when houseId is empty', () => {
      const { result } = renderHook(() => useBusinessMeetings(''), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(oxfordService.getBusinessMeetings).not.toHaveBeenCalled();
    });

    it('surfaces errors from the service', async () => {
      const error = new Error('Failed to fetch meetings');
      (oxfordService.getBusinessMeetings as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useBusinessMeetings('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('caches data under the correct key', async () => {
      const meetings = [makeMeeting()];
      (oxfordService.getBusinessMeetings as jest.Mock).mockResolvedValue(
        meetings,
      );

      const { result } = renderHook(() => useBusinessMeetings('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData(
        oxfordKeys.meetingsByHouse('house1'),
      );
      expect(cached).toEqual(meetings);
    });
  });

  // ── useMeetingVotes ───────────────────────────────────────────────────────

  describe('useMeetingVotes', () => {
    it('fetches votes for a meeting on success', async () => {
      const votes = [makeVote()];
      (oxfordService.getVotesForMeeting as jest.Mock).mockResolvedValue(votes);

      const { result } = renderHook(() => useMeetingVotes('meeting1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(votes);
      expect(oxfordService.getVotesForMeeting).toHaveBeenCalledWith('meeting1');
    });

    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(() => useMeetingVotes('meeting1', false), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(false);
      expect(oxfordService.getVotesForMeeting).not.toHaveBeenCalled();
    });

    it('does not fetch when meetingId is empty', () => {
      const { result } = renderHook(() => useMeetingVotes(''), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(oxfordService.getVotesForMeeting).not.toHaveBeenCalled();
    });

    it('surfaces errors from the service', async () => {
      const error = new Error('Failed to fetch votes');
      (oxfordService.getVotesForMeeting as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useMeetingVotes('meeting1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('caches data under the correct meetingVotes key', async () => {
      const votes = [makeVote()];
      (oxfordService.getVotesForMeeting as jest.Mock).mockResolvedValue(votes);

      const { result } = renderHook(() => useMeetingVotes('meeting1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData(
        oxfordKeys.meetingVotes('meeting1'),
      );
      expect(cached).toEqual(votes);
    });
  });

  // ── useCreateBusinessMeeting ──────────────────────────────────────────────

  describe('useCreateBusinessMeeting', () => {
    const meetingInput: Omit<BusinessMeeting, 'id'> = {
      houseId: 'house1',
      scheduledDate: '2026-02-01',
      agenda: [],
      attendees: [],
      quorumMet: false,
      createdBy: 'user1',
      createdAt: '2026-01-25T00:00:00.000Z',
    };

    it('calls createBusinessMeeting with the correct arguments', async () => {
      const created = makeMeeting();
      (oxfordService.createBusinessMeeting as jest.Mock).mockResolvedValue(
        created,
      );

      const { result } = renderHook(() => useCreateBusinessMeeting(), {
        wrapper,
      });

      result.current.mutate(meetingInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(oxfordService.createBusinessMeeting).toHaveBeenCalledWith(
        meetingInput,
      );
    });

    it('applies an optimistic update before the mutation resolves', async () => {
      // Use a deferred promise so we can inspect the cache mid-flight
      let resolveCreate!: (value: BusinessMeeting) => void;
      const pendingCreate = new Promise<BusinessMeeting>(res => {
        resolveCreate = res;
      });
      (oxfordService.createBusinessMeeting as jest.Mock).mockReturnValue(
        pendingCreate,
      );

      // Seed the cache with an existing meeting
      const existing = makeMeeting({ id: 'existing1' });
      queryClient.setQueryData(oxfordKeys.meetingsByHouse('house1'), [
        existing,
      ]);

      const { result } = renderHook(() => useCreateBusinessMeeting(), {
        wrapper,
      });

      result.current.mutate(meetingInput);

      // Wait until mutation is in-flight (isPending)
      await waitFor(() => expect(result.current.isPending).toBe(true));

      // The cache should now have an optimistic entry prepended
      const cached = queryClient.getQueryData<BusinessMeeting[]>(
        oxfordKeys.meetingsByHouse('house1'),
      );
      expect(cached).toBeDefined();
      expect(cached![0].id).toMatch(/^temp_/);
      expect(cached![1]).toEqual(existing);

      // Now resolve so the hook can clean up
      resolveCreate(makeMeeting());
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it('rolls back the optimistic update on error', async () => {
      const error = new Error('Create failed');
      (oxfordService.createBusinessMeeting as jest.Mock).mockRejectedValue(
        error,
      );

      const existing = makeMeeting({ id: 'existing1' });
      queryClient.setQueryData(oxfordKeys.meetingsByHouse('house1'), [
        existing,
      ]);

      const { result } = renderHook(() => useCreateBusinessMeeting(), {
        wrapper,
      });

      result.current.mutate(meetingInput);

      await waitFor(() => expect(result.current.isError).toBe(true));

      const cached = queryClient.getQueryData<BusinessMeeting[]>(
        oxfordKeys.meetingsByHouse('house1'),
      );
      expect(cached).toEqual([existing]);
    });

    it('invalidates meetingsByHouse on success', async () => {
      (oxfordService.createBusinessMeeting as jest.Mock).mockResolvedValue(
        makeMeeting(),
      );

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateBusinessMeeting(), {
        wrapper,
      });

      result.current.mutate(meetingInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: oxfordKeys.meetingsByHouse('house1'),
      });
    });

    it('surfaces errors when the service call fails', async () => {
      const error = new Error('Create meeting failed');
      (oxfordService.createBusinessMeeting as jest.Mock).mockRejectedValue(
        error,
      );

      const { result } = renderHook(() => useCreateBusinessMeeting(), {
        wrapper,
      });

      result.current.mutate(meetingInput);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('starts in idle state', () => {
      const { result } = renderHook(() => useCreateBusinessMeeting(), {
        wrapper,
      });

      expect(result.current.isIdle).toBe(true);
      expect(result.current.isPending).toBe(false);
    });
  });

  // ── useUpdateBusinessMeeting ──────────────────────────────────────────────

  describe('useUpdateBusinessMeeting', () => {
    it('calls updateBusinessMeeting with id and updates', async () => {
      (oxfordService.updateBusinessMeeting as jest.Mock).mockResolvedValue(
        undefined,
      );

      const { result } = renderHook(() => useUpdateBusinessMeeting(), {
        wrapper,
      });

      result.current.mutate({
        id: 'meeting1',
        updates: { quorumMet: true, minutes: 'Meeting notes here.' },
        houseId: 'house1',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(oxfordService.updateBusinessMeeting).toHaveBeenCalledWith(
        'meeting1',
        {
          quorumMet: true,
          minutes: 'Meeting notes here.',
          houseId: 'house1',
        },
      );
    });

    it('invalidates meetingsByHouse for the provided houseId on success', async () => {
      (oxfordService.updateBusinessMeeting as jest.Mock).mockResolvedValue(
        undefined,
      );

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateBusinessMeeting(), {
        wrapper,
      });

      result.current.mutate({ id: 'meeting1', updates: {}, houseId: 'house1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: oxfordKeys.meetingsByHouse('house1'),
      });
    });

    it('surfaces errors when the service call fails', async () => {
      const error = new Error('Meeting not found');
      (oxfordService.updateBusinessMeeting as jest.Mock).mockRejectedValue(
        error,
      );

      const { result } = renderHook(() => useUpdateBusinessMeeting(), {
        wrapper,
      });

      result.current.mutate({ id: 'missing', updates: {}, houseId: 'house1' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('does not invalidate queries when the mutation fails', async () => {
      (oxfordService.updateBusinessMeeting as jest.Mock).mockRejectedValue(
        new Error('Failure'),
      );

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateBusinessMeeting(), {
        wrapper,
      });

      result.current.mutate({ id: 'meeting1', updates: {}, houseId: 'house1' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  // ── useCastVote ───────────────────────────────────────────────────────────

  describe('useCastVote', () => {
    const voteInput: Omit<Vote, 'id'> = {
      houseId: 'house1',
      meetingId: 'meeting1',
      topic: 'House rule change',
      description: 'Update quiet hours',
      type: 'general',
      options: ['Yes', 'No', 'Abstain'],
      results: { Yes: 0, No: 0, Abstain: 0 },
      individualVotes: {},
      threshold: 0.5,
      passed: false,
      createdAt: '2026-01-15T18:30:00.000Z',
    };

    it('calls castVote with the correct arguments', async () => {
      const created = makeVote();
      (oxfordService.castVote as jest.Mock).mockResolvedValue(created);

      const { result } = renderHook(() => useCastVote(), { wrapper });

      result.current.mutate(voteInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(oxfordService.castVote).toHaveBeenCalledWith(voteInput);
    });

    it('invalidates meetingVotes when the returned vote has a meetingId', async () => {
      const created = makeVote({ meetingId: 'meeting1' });
      (oxfordService.castVote as jest.Mock).mockResolvedValue(created);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCastVote(), { wrapper });

      result.current.mutate(voteInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: oxfordKeys.meetingVotes('meeting1'),
      });
    });

    it('invalidates all elections queries on success', async () => {
      const created = makeVote();
      (oxfordService.castVote as jest.Mock).mockResolvedValue(created);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCastVote(), { wrapper });

      result.current.mutate(voteInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: oxfordKeys.elections(),
      });
    });

    it('does not invalidate meetingVotes when the returned vote has no meetingId', async () => {
      const asyncVote = makeVote({ meetingId: undefined });
      (oxfordService.castVote as jest.Mock).mockResolvedValue(asyncVote);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCastVote(), { wrapper });

      const asyncVoteInput: Omit<Vote, 'id'> = {
        ...voteInput,
        meetingId: undefined,
      };
      result.current.mutate(asyncVoteInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const meetingVotesCalls = invalidateSpy.mock.calls.filter(([arg]) =>
        JSON.stringify(arg).includes('votes'),
      );
      expect(meetingVotesCalls).toHaveLength(0);
    });

    it('surfaces errors when the service call fails', async () => {
      const error = new Error('Cast vote failed');
      (oxfordService.castVote as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useCastVote(), { wrapper });

      result.current.mutate(voteInput);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ── useElections ──────────────────────────────────────────────────────────

  describe('useElections', () => {
    it('fetches elections and returns them on success', async () => {
      const elections = [makeElection()];
      (oxfordService.getElections as jest.Mock).mockResolvedValue(elections);

      const { result } = renderHook(() => useElections('house1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(elections);
      expect(oxfordService.getElections).toHaveBeenCalledWith('house1');
    });

    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(() => useElections('house1', false), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(false);
      expect(oxfordService.getElections).not.toHaveBeenCalled();
    });

    it('does not fetch when houseId is empty', () => {
      const { result } = renderHook(() => useElections(''), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(oxfordService.getElections).not.toHaveBeenCalled();
    });

    it('surfaces errors from the service', async () => {
      const error = new Error('Failed to fetch elections');
      (oxfordService.getElections as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useElections('house1'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('caches data under the correct key', async () => {
      const elections = [makeElection()];
      (oxfordService.getElections as jest.Mock).mockResolvedValue(elections);

      const { result } = renderHook(() => useElections('house1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData(
        oxfordKeys.electionsByHouse('house1'),
      );
      expect(cached).toEqual(elections);
    });
  });

  // ── useCreateElection ─────────────────────────────────────────────────────

  describe('useCreateElection', () => {
    const electionInput: Omit<Election, 'id'> = {
      houseId: 'house1',
      role: 'treasurer',
      candidates: [{ userId: 'user2', nominatedBy: 'user1' }],
      voteId: 'vote2',
      termStartDate: '2026-01-01',
      termEndDate: '2026-07-01',
      conductedAt: '2026-01-10T00:00:00.000Z',
    };

    it('calls createElection with the correct arguments', async () => {
      const created = makeElection();
      (oxfordService.createElection as jest.Mock).mockResolvedValue(created);

      const { result } = renderHook(() => useCreateElection(), { wrapper });

      result.current.mutate(electionInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(oxfordService.createElection).toHaveBeenCalledWith(electionInput);
    });

    it('invalidates electionsByHouse on success', async () => {
      const created = makeElection();
      (oxfordService.createElection as jest.Mock).mockResolvedValue(created);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateElection(), { wrapper });

      result.current.mutate(electionInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: oxfordKeys.electionsByHouse('house1'),
      });
    });

    it('surfaces errors when the service call fails', async () => {
      const error = new Error('Create election failed');
      (oxfordService.createElection as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useCreateElection(), { wrapper });

      result.current.mutate(electionInput);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ── useEESTransactions ────────────────────────────────────────────────────

  describe('useEESTransactions', () => {
    it('fetches EES transactions and returns them on success', async () => {
      const transactions = [makeTransaction()];
      (oxfordService.getEESTransactions as jest.Mock).mockResolvedValue(
        transactions,
      );

      const { result } = renderHook(() => useEESTransactions('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(transactions);
      expect(oxfordService.getEESTransactions).toHaveBeenCalledWith('house1');
    });

    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(() => useEESTransactions('house1', false), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(false);
      expect(oxfordService.getEESTransactions).not.toHaveBeenCalled();
    });

    it('does not fetch when houseId is empty', () => {
      const { result } = renderHook(() => useEESTransactions(''), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(oxfordService.getEESTransactions).not.toHaveBeenCalled();
    });

    it('surfaces errors from the service', async () => {
      const error = new Error('Failed to fetch transactions');
      (oxfordService.getEESTransactions as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useEESTransactions('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('caches data under the correct key', async () => {
      const transactions = [makeTransaction()];
      (oxfordService.getEESTransactions as jest.Mock).mockResolvedValue(
        transactions,
      );

      const { result } = renderHook(() => useEESTransactions('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData(
        oxfordKeys.eesTransactionsByHouse('house1'),
      );
      expect(cached).toEqual(transactions);
    });
  });

  // ── useCreateEESTransaction ───────────────────────────────────────────────

  describe('useCreateEESTransaction', () => {
    const txInput: Omit<EESTransaction, 'id'> = {
      houseId: 'house1',
      guestId: 'guest1',
      amount: 150,
      period: '2026-01-05',
      type: 'payment',
      status: 'pending',
      createdAt: '2026-01-05T00:00:00.000Z',
    };

    it('calls createEESTransaction with the correct arguments', async () => {
      const created = makeTransaction();
      (oxfordService.createEESTransaction as jest.Mock).mockResolvedValue(
        created,
      );

      const { result } = renderHook(() => useCreateEESTransaction(), {
        wrapper,
      });

      result.current.mutate(txInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(oxfordService.createEESTransaction).toHaveBeenCalledWith(txInput);
    });

    it('invalidates eesTransactionsByHouse on success', async () => {
      const created = makeTransaction();
      (oxfordService.createEESTransaction as jest.Mock).mockResolvedValue(
        created,
      );

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateEESTransaction(), {
        wrapper,
      });

      result.current.mutate(txInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: oxfordKeys.eesTransactionsByHouse('house1'),
      });
    });

    it('surfaces errors when the service call fails', async () => {
      const error = new Error('Create transaction failed');
      (oxfordService.createEESTransaction as jest.Mock).mockRejectedValue(
        error,
      );

      const { result } = renderHook(() => useCreateEESTransaction(), {
        wrapper,
      });

      result.current.mutate(txInput);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('starts in idle state', () => {
      const { result } = renderHook(() => useCreateEESTransaction(), {
        wrapper,
      });

      expect(result.current.isIdle).toBe(true);
      expect(result.current.isPending).toBe(false);
    });
  });

  // ── useFinancialRecords ───────────────────────────────────────────────────

  describe('useFinancialRecords', () => {
    it('fetches financial records and returns them on success', async () => {
      const records = [makeFinancialRecord()];
      (oxfordService.getFinancialRecords as jest.Mock).mockResolvedValue(
        records,
      );

      const { result } = renderHook(() => useFinancialRecords('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(records);
      expect(oxfordService.getFinancialRecords).toHaveBeenCalledWith('house1');
    });

    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(
        () => useFinancialRecords('house1', false),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(oxfordService.getFinancialRecords).not.toHaveBeenCalled();
    });

    it('does not fetch when houseId is empty', () => {
      const { result } = renderHook(() => useFinancialRecords(''), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(oxfordService.getFinancialRecords).not.toHaveBeenCalled();
    });

    it('surfaces errors from the service', async () => {
      const error = new Error('Failed to fetch financial records');
      (oxfordService.getFinancialRecords as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useFinancialRecords('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('caches data under the correct key', async () => {
      const records = [makeFinancialRecord()];
      (oxfordService.getFinancialRecords as jest.Mock).mockResolvedValue(
        records,
      );

      const { result } = renderHook(() => useFinancialRecords('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData(
        oxfordKeys.financialRecordsByHouse('house1'),
      );
      expect(cached).toEqual(records);
    });
  });

  // ── useCreateFinancialRecord ──────────────────────────────────────────────

  describe('useCreateFinancialRecord', () => {
    const recordInput: Omit<FinancialRecord, 'id'> = {
      houseId: 'house1',
      period: '2026-01-05',
      totalIncome: 600,
      totalExpenses: 400,
      balance: 200,
      breakdown: [{ category: 'Rent', amount: 400 }],
      submittedBy: 'user1',
      submittedAt: '2026-01-12T00:00:00.000Z',
      approvedByVote: false,
    };

    it('calls createFinancialRecord with the correct arguments', async () => {
      const created = makeFinancialRecord();
      (oxfordService.createFinancialRecord as jest.Mock).mockResolvedValue(
        created,
      );

      const { result } = renderHook(() => useCreateFinancialRecord(), {
        wrapper,
      });

      result.current.mutate(recordInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(oxfordService.createFinancialRecord).toHaveBeenCalledWith(
        recordInput,
      );
    });

    it('invalidates financialRecordsByHouse on success', async () => {
      const created = makeFinancialRecord();
      (oxfordService.createFinancialRecord as jest.Mock).mockResolvedValue(
        created,
      );

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateFinancialRecord(), {
        wrapper,
      });

      result.current.mutate(recordInput);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: oxfordKeys.financialRecordsByHouse('house1'),
      });
    });

    it('surfaces errors when the service call fails', async () => {
      const error = new Error('Create financial record failed');
      (oxfordService.createFinancialRecord as jest.Mock).mockRejectedValue(
        error,
      );

      const { result } = renderHook(() => useCreateFinancialRecord(), {
        wrapper,
      });

      result.current.mutate(recordInput);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('does not invalidate queries when the mutation fails', async () => {
      (oxfordService.createFinancialRecord as jest.Mock).mockRejectedValue(
        new Error('Failure'),
      );

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateFinancialRecord(), {
        wrapper,
      });

      result.current.mutate(recordInput);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('starts in idle state', () => {
      const { result } = renderHook(() => useCreateFinancialRecord(), {
        wrapper,
      });

      expect(result.current.isIdle).toBe(true);
      expect(result.current.isPending).toBe(false);
    });
  });
});
