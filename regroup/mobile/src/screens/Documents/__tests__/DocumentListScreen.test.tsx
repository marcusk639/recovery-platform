/**
 * Unit tests for DocumentListScreen.
 *
 * Mocks: documentQueries, logging, navigation. @react-native-documents/picker is the global mock
 * (jest.setup.js), with the library's real errorCodes / isErrorWithCode.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockMutateAsync = jest.fn();

jest.mock('../../../state/queries/documentQueries', () => ({
  useDocuments: jest.fn(),
  useExpiringDocuments: jest.fn(() => ({ data: [] })),
  useUploadDocument: jest.fn(() => ({
    mutateAsync: mockMutateAsync,
    isLoading: false,
  })),
  useDeleteDocument: jest.fn(() => ({
    mutateAsync: mockMutateAsync,
    isLoading: false,
  })),
}));

jest.mock('../../../util/logging', () => ({
  logException: jest.fn(),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ goBack: jest.fn() }),
    useRoute: () => ({
      params: {
        houseId: 'house-1',
        guestId: 'guest-1',
        title: 'Resident Documents',
      },
    }),
  };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import DocumentListScreen from '../DocumentListScreen';
import * as documentQueries from '../../../state/queries/documentQueries';
import * as DocumentPicker from '@react-native-documents/picker';
import { logException } from '../../../util/logging';
import { HouseDocument } from '../../../entities/Document';

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockDoc: HouseDocument = {
  id: 'doc-1',
  houseId: 'house-1',
  guestId: 'guest-1',
  fileName: 'lease.pdf',
  storageUrl: 'https://storage.example.com/lease.pdf',
  storagePath: 'houses/house-1/guests/guest-1/documents/doc-1',
  fileType: 'pdf',
  category: 'lease',
  uploadedBy: 'admin-uid-1',
  createdAt: '2026-05-22T00:00:00.000Z',
};

const mockExpiringDoc: HouseDocument = {
  ...mockDoc,
  id: 'doc-expiring',
  fileName: 'cert.pdf',
  category: 'compliance',
  expiresAt: '2026-06-01T00:00:00.000Z', // within 30 days of 2026-05-22
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DocumentListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loading state', () => {
    it('renders loading indicator while fetching', () => {
      (documentQueries.useDocuments as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: true,
      });
      const { getByTestId } = render(<DocumentListScreen />);
      // RatsLoadingIndicator is the loading state — verify no list is shown
      expect(() => getByTestId('document-list')).toThrow();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no documents exist', () => {
      (documentQueries.useDocuments as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
      });
      const { getByTestId } = render(<DocumentListScreen />);
      expect(getByTestId('empty-documents')).toBeTruthy();
    });
  });

  describe('document list', () => {
    beforeEach(() => {
      (documentQueries.useDocuments as jest.Mock).mockReturnValue({
        data: [mockDoc],
        isLoading: false,
      });
    });

    it('renders document rows', () => {
      const { getByTestId } = render(<DocumentListScreen />);
      expect(getByTestId('document-list')).toBeTruthy();
      expect(getByTestId(`document-row-${mockDoc.id}`)).toBeTruthy();
    });

    it('shows the file name in each row', () => {
      const { getByText } = render(<DocumentListScreen />);
      expect(getByText('lease.pdf')).toBeTruthy();
    });

    it('shows the category label', () => {
      const { getByText } = render(<DocumentListScreen />);
      expect(getByText('Lease Agreement')).toBeTruthy();
    });
  });

  describe('expiry badge', () => {
    it('renders expiry warning for docs expiring soon', () => {
      jest.useFakeTimers({ now: new Date('2026-05-22T00:00:00.000Z') });
      (documentQueries.useDocuments as jest.Mock).mockReturnValue({
        data: [mockExpiringDoc],
        isLoading: false,
      });
      const { getByText } = render(<DocumentListScreen />);
      // Should show the expiry label
      expect(getByText(/Expires/)).toBeTruthy();
      jest.useRealTimers();
    });
  });

  describe('upload', () => {
    beforeEach(() => {
      (documentQueries.useDocuments as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
      });
    });

    it('renders the upload button', () => {
      const { getByTestId } = render(<DocumentListScreen />);
      expect(getByTestId('upload-document-button')).toBeTruthy();
    });

    it('shows category alert after picking a file', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      (DocumentPicker.pick as jest.Mock).mockResolvedValueOnce([
        {
          uri: '/tmp/lease.pdf',
          name: 'lease.pdf',
          type: 'application/pdf',
        },
      ]);

      const { getByTestId } = render(<DocumentListScreen />);
      fireEvent.press(getByTestId('upload-document-button'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Choose Category',
          expect.any(String),
          expect.any(Array),
        );
      });
    });

    it('does not show alert when picker is cancelled', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const cancelError = Object.assign(new Error('cancelled'), {
        code: DocumentPicker.errorCodes.OPERATION_CANCELED,
      });
      (DocumentPicker.pick as jest.Mock).mockRejectedValueOnce(cancelError);

      const { getByTestId } = render(<DocumentListScreen />);
      fireEvent.press(getByTestId('upload-document-button'));

      await waitFor(() => {
        expect(alertSpy).not.toHaveBeenCalled();
      });
      expect(logException).not.toHaveBeenCalled();
    });

    /** Picks `file`, then presses the first category in the "Choose Category" alert. */
    async function pickAndChooseCategory(file: Record<string, unknown>) {
      const alertSpy = jest.spyOn(Alert, 'alert');
      (DocumentPicker.pick as jest.Mock).mockResolvedValueOnce([file]);
      const screen = render(<DocumentListScreen />);
      fireEvent.press(screen.getByTestId('upload-document-button'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Choose Category', expect.any(String), expect.any(Array)));
      const buttons = alertSpy.mock.calls.find(([title]) => title === 'Choose Category')![2] as any[];
      await buttons[0].onPress();
      return alertSpy;
    }

    it('rejects a file with no name before copying it', async () => {
      const alertSpy = await pickAndChooseCategory({ uri: 'content://doc/1', name: null, type: 'application/pdf' });

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Error', 'Invalid file selected.'));
      expect(DocumentPicker.keepLocalCopy).not.toHaveBeenCalled();
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('logs a failed local copy, tells the user, and uploads nothing', async () => {
      (DocumentPicker.keepLocalCopy as jest.Mock).mockResolvedValueOnce([
        { status: 'error', sourceUri: 'content://doc/1', copyError: 'no space' },
      ]);

      const alertSpy = await pickAndChooseCategory({ uri: 'content://doc/1', name: 'lease.pdf', type: 'application/pdf' });

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Upload Failed', expect.any(String)));
      expect(logException).toHaveBeenCalledWith(expect.any(Error), 'DocumentListScreen: keepLocalCopy');
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('uploads the local copy under the picked name, type and category', async () => {
      mockMutateAsync.mockResolvedValueOnce(undefined);

      await pickAndChooseCategory({ uri: 'content://doc/1', name: 'lease.pdf', type: 'application/pdf' });

      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
      expect(DocumentPicker.keepLocalCopy).toHaveBeenCalledWith({
        files: [{ uri: 'content://doc/1', fileName: 'lease.pdf' }],
        destination: 'cachesDirectory',
      });
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          houseId: 'house-1',
          guestId: 'guest-1',
          localPath: 'file:///mock/caches/lease.pdf',
          fileName: 'lease.pdf',
          mimeType: 'application/pdf',
          category: 'lease',
        }),
      );
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      (documentQueries.useDocuments as jest.Mock).mockReturnValue({
        data: [mockDoc],
        isLoading: false,
      });
    });

    it('shows a confirmation alert before deleting', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const { getByTestId } = render(<DocumentListScreen />);

      fireEvent.press(getByTestId(`document-delete-${mockDoc.id}`));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Delete Document',
          expect.stringContaining('lease.pdf'),
          expect.any(Array),
        );
      });
    });
  });
});
