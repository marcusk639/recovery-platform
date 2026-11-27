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

const mockGetDocumentLink = jest.fn();
jest.mock('../../../services/documents', () => ({
  getDocumentLink: (...args: any[]) => mockGetDocumentLink(...args),
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

// The caller's role in house-1: an admin unless a test says otherwise.
let mockRole: Record<string, string> = { 'house-1': 'admin' };
jest.mock('../../../context/auth', () => ({
  useRoleToken: () => ({ claims: {}, role: mockRole }),
}));

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
    mockRole = { 'house-1': 'admin' };
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

  // ─── Opening a document: a short-lived link, not a stored one ───────────────
  describe('opening a document', () => {
    const { Linking } = require('react-native');
    const showList = () => {
      (documentQueries.useDocuments as jest.Mock).mockReturnValue({
        data: [mockDoc],
        isLoading: false,
      });
      return render(<DocumentListScreen />);
    };

    beforeEach(() => {
      jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });

    it('opens the link the server signs for it', async () => {
      mockGetDocumentLink.mockResolvedValue('https://signed.example/doc-1');
      fireEvent.press(showList().getByTestId(`document-open-${mockDoc.id}`));
      await waitFor(() =>
        expect(Linking.openURL).toHaveBeenCalledWith('https://signed.example/doc-1'),
      );
      expect(mockGetDocumentLink).toHaveBeenCalledWith('doc-1');
    });

    it("says so, and opens nothing, when the link can't be fetched", async () => {
      mockGetDocumentLink.mockRejectedValue(new Error('not-found'));
      fireEvent.press(showList().getByTestId(`document-open-${mockDoc.id}`));
      await waitFor(() =>
        expect(Alert.alert).toHaveBeenCalledWith('Error', "Couldn't open the document. Try again."),
      );
      expect(Linking.openURL).not.toHaveBeenCalled();
    });
  });
});

// A resident opens their own documents from the limited view (launch spec
// §4.1 item 2). The rules let them read and nothing else, so the screen
// offers no upload and no delete.
describe('DocumentListScreen for a resident', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = { 'house-1': 'guest' };
    (documentQueries.useDocuments as jest.Mock).mockReturnValue({
      data: [mockDoc],
      isLoading: false,
    });
  });

  it('lists their own documents (the guestId from the route)', () => {
    const { getByTestId } = render(<DocumentListScreen />);
    expect(documentQueries.useDocuments).toHaveBeenCalledWith('house-1', 'guest-1');
    expect(getByTestId(`document-row-${mockDoc.id}`)).toBeTruthy();
  });

  it('offers no upload button', () => {
    const { queryByTestId } = render(<DocumentListScreen />);
    expect(queryByTestId('upload-document-button')).toBeNull();
  });

  it('offers no delete button', () => {
    const { queryByTestId } = render(<DocumentListScreen />);
    expect(queryByTestId(`document-delete-${mockDoc.id}`)).toBeNull();
  });

  it('still opens a document', async () => {
    const { Linking } = require('react-native');
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockGetDocumentLink.mockResolvedValue('https://signed.example/doc');
    const { getByTestId } = render(<DocumentListScreen />);
    fireEvent.press(getByTestId(`document-open-${mockDoc.id}`));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith('https://signed.example/doc'));
  });

  it("doesn't tell them to upload when there is nothing yet", () => {
    (documentQueries.useDocuments as jest.Mock).mockReturnValue({ data: [], isLoading: false });
    const { getByTestId, queryByText } = render(<DocumentListScreen />);
    expect(getByTestId('empty-documents')).toBeTruthy();
    expect(queryByText('Tap Upload Document to add one.')).toBeNull();
  });

  it('treats a role not loaded yet as read-only', () => {
    mockRole = {};
    const { queryByTestId } = render(<DocumentListScreen />);
    expect(queryByTestId('upload-document-button')).toBeNull();
  });
});
