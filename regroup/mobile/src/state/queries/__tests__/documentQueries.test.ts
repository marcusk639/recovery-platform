/**
 * Unit tests for documentQueries React Query hooks.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useDocuments,
  useExpiringDocuments,
  useUploadDocument,
  useDeleteDocument,
  documentKeys,
} from '../documentQueries';
import * as documentService from '../../../services/documents';
import * as loggingModule from '../../../util/logging';
import { HouseDocument } from '../../../entities/Document';

// Mock the service and logging modules
jest.mock('../../../services/documents');
jest.mock('../../../util/logging');

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockDoc: HouseDocument = {
  id: 'doc-1',
  houseId: 'house-1',
  fileName: 'lease.pdf',
  storageUrl: 'https://storage.example.com/lease.pdf',
  storagePath: 'houses/house-1/documents/doc-1',
  fileType: 'pdf',
  category: 'lease',
  uploadedBy: 'admin-uid-1',
  createdAt: '2026-05-22T00:00:00.000Z',
};

const mockExpiringDoc: HouseDocument = {
  ...mockDoc,
  id: 'doc-expiring',
  expiresAt: '2026-06-01T00:00:00.000Z',
  category: 'compliance',
};

// ─── Test setup ───────────────────────────────────────────────────────────────

describe('documentQueries', () => {
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
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  // ─── documentKeys ─────────────────────────────────────────────────────────

  describe('documentKeys', () => {
    it('generates the correct base key', () => {
      expect(documentKeys.all).toEqual(['documents']);
    });

    it('generates a house-scoped list key', () => {
      expect(documentKeys.list('house-1')).toEqual([
        'documents',
        'list',
        'house-1',
        'house',
      ]);
    });

    it('generates a guest-scoped list key', () => {
      expect(documentKeys.list('house-1', 'guest-1')).toEqual([
        'documents',
        'list',
        'house-1',
        'guest-1',
      ]);
    });

    it('generates the expiring key', () => {
      expect(documentKeys.expiring('house-1')).toEqual([
        'documents',
        'expiring',
        'house-1',
      ]);
    });
  });

  // ─── useDocuments ─────────────────────────────────────────────────────────

  describe('useDocuments', () => {
    it('fetches house-level documents', async () => {
      (documentService.listDocuments as jest.Mock).mockResolvedValue([mockDoc]);

      const { result } = renderHook(() => useDocuments('house-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([mockDoc]);
      expect(documentService.listDocuments).toHaveBeenCalledWith(
        'house-1',
        undefined,
      );
    });

    it('fetches resident documents when guestId is provided', async () => {
      const guestDoc = { ...mockDoc, guestId: 'guest-1' };
      (documentService.listDocuments as jest.Mock).mockResolvedValue([
        guestDoc,
      ]);

      const { result } = renderHook(() => useDocuments('house-1', 'guest-1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(documentService.listDocuments).toHaveBeenCalledWith(
        'house-1',
        'guest-1',
      );
    });

    it('is disabled when houseId is empty', () => {
      const { result } = renderHook(() => useDocuments(''), { wrapper });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  // ─── useExpiringDocuments ─────────────────────────────────────────────────

  describe('useExpiringDocuments', () => {
    it('fetches expiring documents', async () => {
      (documentService.getExpiringDocuments as jest.Mock).mockResolvedValue([
        mockExpiringDoc,
      ]);

      const { result } = renderHook(() => useExpiringDocuments('house-1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([mockExpiringDoc]);
    });

    it('is disabled when houseId is empty', () => {
      const { result } = renderHook(() => useExpiringDocuments(''), {
        wrapper,
      });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  // ─── useUploadDocument ────────────────────────────────────────────────────

  describe('useUploadDocument', () => {
    it('calls uploadDocument and invalidates queries on success', async () => {
      (documentService.uploadDocument as jest.Mock).mockResolvedValue(mockDoc);
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUploadDocument('house-1'), {
        wrapper,
      });

      await result.current.mutateAsync({
        houseId: 'house-1',
        localPath: '/tmp/lease.pdf',
        fileName: 'lease.pdf',
        category: 'lease',
      });

      expect(documentService.uploadDocument).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: documentKeys.list('house-1', undefined),
        }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: documentKeys.expiring('house-1'),
        }),
      );
    });

    it('calls logException on error', async () => {
      const err = new Error('Upload failed');
      (documentService.uploadDocument as jest.Mock).mockRejectedValue(err);

      const { result } = renderHook(() => useUploadDocument('house-1'), {
        wrapper,
      });

      await expect(
        result.current.mutateAsync({
          houseId: 'house-1',
          localPath: '/tmp/file.pdf',
          fileName: 'file.pdf',
          category: 'other',
        }),
      ).rejects.toThrow('Upload failed');

      expect(loggingModule.logException).toHaveBeenCalledWith(err);
    });
  });

  // ─── useDeleteDocument ────────────────────────────────────────────────────

  describe('useDeleteDocument', () => {
    it('calls deleteDocument and invalidates queries on success', async () => {
      (documentService.deleteDocument as jest.Mock).mockResolvedValue(
        undefined,
      );
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteDocument('house-1'), {
        wrapper,
      });

      await result.current.mutateAsync({
        docId: 'doc-1',
        storagePath: 'houses/house-1/documents/doc-1',
        guestId: 'guest-1',
      });

      expect(documentService.deleteDocument).toHaveBeenCalledWith(
        'doc-1',
        'houses/house-1/documents/doc-1',
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: documentKeys.list('house-1', 'guest-1'),
        }),
      );
    });
  });
});
