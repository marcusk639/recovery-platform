import React from 'react';
import { render as rtlRender, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GuestImportScreen from '../GuestImportScreen';
import * as DocumentPicker from '@react-native-documents/picker';
import * as importService from '../../../services/guestImport';
import { useData } from '../../../context/DataContext';
import { logException } from '../../../util/logging';

// @react-native-documents/picker: the global mock (jest.setup.js), real errorCodes.
jest.mock('../../../services/guestImport');
jest.mock('../../../context/DataContext');
jest.mock('@dr.pogodin/react-native-fs', () => ({ readFile: jest.fn() }));
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));
// Owner decision 2026-11-27: owners and managers only.
let mockAccess: 'yes' | 'no' | 'checking' = 'yes';
jest.mock('../../../state/queries/houseTierQueries', () => ({
  useHouseMoneyAccess: () => mockAccess,
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

// The screen reads DataContext's currentHouse; DataContext has no `house` (P5 Task 17).
(useData as jest.Mock).mockReturnValue({ currentHouse: { id: 'house-1' } });

let queryClient: QueryClient;
const render = (ui: React.ReactElement) => {
  queryClient = new QueryClient();
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};
jest.mock('../../../components/screen-header', () => {
  const { Text } = require('react-native');
  return ({ header, renderBackButton }: any) => (
    <Text testID={renderBackButton ? 'header-with-back' : 'header'}>{header}</Text>
  );
});
const JANE = {
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.com',
  sobrietyDate: '2025-01-15',
  drugOfChoice: 'Alcohol',
};
beforeEach(() => {
  mockAccess = 'yes';
  (importService.parseGuestCsvReport as jest.Mock).mockReturnValue({ rows: [JANE], skipped: [] });
  (importService.importGuests as jest.Mock).mockResolvedValue({
    imported: 1,
    alreadyResidents: 0,
    failed: 0,
  });
});

it('shows pick CSV button', () => {
  const { getByTestId } = render(<GuestImportScreen />);
  expect(getByTestId('pick-csv-button')).toBeTruthy();
});

it('shows preview after file picked and parsed', async () => {
  (DocumentPicker.pick as jest.Mock).mockResolvedValue([
    { uri: 'file://test.csv', name: 'test.csv' },
  ]);
  const RNFS = require('@dr.pogodin/react-native-fs');
  RNFS.readFile.mockResolvedValue(
    'firstName,lastName,email,sobrietyDate,drugOfChoice\nJane,Smith,jane@example.com,2025-01-15,Alcohol',
  );

  const { getByTestId, getByText } = render(<GuestImportScreen />);
  fireEvent.press(getByTestId('pick-csv-button'));
  await waitFor(() => expect(getByText('Jane Smith')).toBeTruthy());
});

it('imports guests and shows success count', async () => {
  (DocumentPicker.pick as jest.Mock).mockResolvedValue([
    { uri: 'file://test.csv', name: 'test.csv' },
  ]);
  const RNFS = require('@dr.pogodin/react-native-fs');
  RNFS.readFile.mockResolvedValue(
    'firstName,lastName,email,sobrietyDate,drugOfChoice\nJane,Smith,jane@example.com,2025-01-15,Alcohol',
  );

  const { getByTestId, getByText } = render(<GuestImportScreen />);
  fireEvent.press(getByTestId('pick-csv-button'));
  await waitFor(() => getByTestId('import-button'));
  fireEvent.press(getByTestId('import-button'));
  await waitFor(() => expect(getByText(/1 resident/i)).toBeTruthy());
});

const CSV = 'firstName,lastName,email,sobrietyDate,drugOfChoice\nJane,Smith,jane@example.com,2025-01-15,Alcohol';

it('picks CSV or plain-text files and reads the local copy as UTF-8', async () => {
  (DocumentPicker.pick as jest.Mock).mockResolvedValue([{ uri: 'content://csv/1', name: 'guests.csv' }]);
  const RNFS = require('@dr.pogodin/react-native-fs');
  RNFS.readFile.mockResolvedValue(CSV);

  const { getByTestId, getByText } = render(<GuestImportScreen />);
  fireEvent.press(getByTestId('pick-csv-button'));
  await waitFor(() => expect(getByText('Jane Smith')).toBeTruthy());

  expect(DocumentPicker.pick).toHaveBeenCalledWith({
    type: [DocumentPicker.types.csv, DocumentPicker.types.plainText].flat(),
  });
  expect(DocumentPicker.keepLocalCopy).toHaveBeenCalledWith({
    files: [{ uri: 'content://csv/1', fileName: 'guests.csv' }],
    destination: 'cachesDirectory',
  });
  expect(RNFS.readFile).toHaveBeenCalledWith('file:///mock/caches/guests.csv', 'utf8');
});

it('does nothing and logs nothing when the picker is cancelled', async () => {
  (DocumentPicker.pick as jest.Mock).mockRejectedValue(
    Object.assign(new Error('cancelled'), { code: DocumentPicker.errorCodes.OPERATION_CANCELED }),
  );

  const { getByTestId, queryByText } = render(<GuestImportScreen />);
  fireEvent.press(getByTestId('pick-csv-button'));
  await waitFor(() => expect(DocumentPicker.pick).toHaveBeenCalled());

  expect(logException).not.toHaveBeenCalled();
  expect(queryByText(/Could not read file/)).toBeNull();
});

it('reports an unreadable file without ever logging its content', async () => {
  (DocumentPicker.pick as jest.Mock).mockResolvedValue([{ uri: 'content://csv/1', name: 'guests.csv' }]);
  const RNFS = require('@dr.pogodin/react-native-fs');
  RNFS.readFile.mockResolvedValue(CSV);
  (importService.parseGuestCsvReport as jest.Mock).mockImplementationOnce(() => {
    throw new Error('bad header');
  });

  const { getByTestId, getByText } = render(<GuestImportScreen />);
  fireEvent.press(getByTestId('pick-csv-button'));
  await waitFor(() => expect(getByText(/Could not read file/)).toBeTruthy());

  expect(logException).toHaveBeenCalledTimes(1);
  expect(JSON.stringify((logException as jest.Mock).mock.calls)).not.toContain('jane@example.com');
});

it('reports a failed local copy', async () => {
  (DocumentPicker.pick as jest.Mock).mockResolvedValue([{ uri: 'content://csv/1', name: 'guests.csv' }]);
  (DocumentPicker.keepLocalCopy as jest.Mock).mockResolvedValueOnce([
    { status: 'error', sourceUri: 'content://csv/1', copyError: 'denied' },
  ]);
  const RNFS = require('@dr.pogodin/react-native-fs');
  RNFS.readFile.mockClear();

  const { getByTestId, getByText } = render(<GuestImportScreen />);
  fireEvent.press(getByTestId('pick-csv-button'));
  await waitFor(() => expect(getByText(/Could not read file/)).toBeTruthy());

  expect(RNFS.readFile).not.toHaveBeenCalled();
  expect(logException).toHaveBeenCalledWith(expect.any(Error), 'GuestImportScreen: keepLocalCopy');
});

// ─── P5 Task 17 ──────────────────────────────────────────────────────────────

it('imports into the selected house and refreshes its guest list', async () => {
  (DocumentPicker.pick as jest.Mock).mockResolvedValue([{ uri: 'content://csv/1', name: 'guests.csv' }]);
  const RNFS = require('@dr.pogodin/react-native-fs');
  RNFS.readFile.mockResolvedValue(CSV);
  (importService.importGuests as jest.Mock).mockClear();

  const { getByTestId, getByText } = render(<GuestImportScreen />);
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  fireEvent.press(getByTestId('pick-csv-button'));
  await waitFor(() => getByTestId('import-button'));
  fireEvent.press(getByTestId('import-button'));
  await waitFor(() => expect(getByText(/1 resident/i)).toBeTruthy());

  expect(importService.importGuests).toHaveBeenCalledWith('house-1', [
    expect.objectContaining({ firstName: 'Jane', lastName: 'Smith' }),
  ]);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['guests'] });
});

it("shows the parser's missing-column message", async () => {
  (DocumentPicker.pick as jest.Mock).mockResolvedValue([{ uri: 'content://csv/1', name: 'guests.csv' }]);
  const RNFS = require('@dr.pogodin/react-native-fs');
  RNFS.readFile.mockResolvedValue('firstName,lastName,email,sobrietyDate\nJane,Smith,j@x.com,2025-01-15');
  const { GuestCsvError } = jest.requireActual('../../../services/guestImport');
  (importService.parseGuestCsvReport as jest.Mock).mockImplementationOnce(() => {
    throw new GuestCsvError('Missing column: drugOfChoice');
  });

  const { getByTestId, getByText, queryByText } = render(<GuestImportScreen />);
  fireEvent.press(getByTestId('pick-csv-button'));
  await waitFor(() => expect(getByText('Missing column: drugOfChoice')).toBeTruthy());
  expect(queryByText(/Could not read file/)).toBeNull();
});

it('has a header with a back button', () => {
  const { getByTestId } = render(<GuestImportScreen />);
  expect(getByTestId('header-with-back')).toBeTruthy();
  expect(getByTestId('guest-import-screen')).toBeTruthy();
});

// Review of #306 (2026-11-27): no row is dropped without a reason, and a
// partial import says what happened and that a retry is safe.
const pickCsv = async (screen: ReturnType<typeof render>) => {
  (DocumentPicker.pick as jest.Mock).mockResolvedValue([{ uri: 'content://csv/1', name: 'guests.csv' }]);
  require('@dr.pogodin/react-native-fs').readFile.mockResolvedValue(CSV);
  fireEvent.press(screen.getByTestId('pick-csv-button'));
};

it('says how many rows are ready and why each other row is skipped', async () => {
  (importService.parseGuestCsvReport as jest.Mock).mockReturnValue({
    rows: [JANE],
    skipped: [
      { row: 2, reason: 'sobrietyDate is not a date (use YYYY-MM-DD)' },
      { row: 3, reason: 'email appears earlier in the file' },
    ],
  });
  const screen = render(<GuestImportScreen />);
  await pickCsv(screen);
  await waitFor(() => expect(screen.getByText('1 ready, 2 skipped')).toBeTruthy());
  expect(screen.getByText('Row 2: sobrietyDate is not a date (use YYYY-MM-DD)')).toBeTruthy();
  expect(screen.getByText('Row 3: email appears earlier in the file')).toBeTruthy();
});

it('says when every row was skipped, and offers no import', async () => {
  (importService.parseGuestCsvReport as jest.Mock).mockReturnValue({
    rows: [],
    skipped: [{ row: 1, reason: 'missing email' }],
  });
  const screen = render(<GuestImportScreen />);
  await pickCsv(screen);
  await waitFor(() => expect(screen.getByText('0 ready, 1 skipped')).toBeTruthy());
  expect(screen.queryByTestId('import-button')).toBeNull();
});

it('reports a partial import and that importing again is safe', async () => {
  (importService.importGuests as jest.Mock).mockResolvedValue({
    imported: 499,
    alreadyResidents: 2,
    failed: 101,
  });
  const screen = render(<GuestImportScreen />);
  await pickCsv(screen);
  await waitFor(() => screen.getByTestId('import-button'));
  fireEvent.press(screen.getByTestId('import-button'));
  await waitFor(() =>
    expect(
      screen.getByText(
        '499 imported, 101 failed. 2 were already residents. Importing the same file again is safe: it adds only the ones missing.',
      ),
    ).toBeTruthy(),
  );
});

it('refuses a peer leader, who may not bulk-add residents', () => {
  mockAccess = 'no';
  const screen = render(<GuestImportScreen />);
  expect(screen.getByTestId('guest-import-no-access')).toBeTruthy();
  expect(screen.queryByTestId('pick-csv-button')).toBeNull();
  expect(screen.getByTestId('header-with-back')).toBeTruthy();
});

it('shows nothing to import while it checks the role', () => {
  mockAccess = 'checking';
  const screen = render(<GuestImportScreen />);
  expect(screen.queryByTestId('pick-csv-button')).toBeNull();
  expect(screen.queryByTestId('guest-import-no-access')).toBeNull();
});

it('lets an owner or a manager in', () => {
  mockAccess = 'yes';
  const screen = render(<GuestImportScreen />);
  expect(screen.getByTestId('pick-csv-button')).toBeTruthy();
});
