import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import GuestImportScreen from '../GuestImportScreen';
import * as DocumentPicker from 'react-native-document-picker';
import * as importService from '../../../services/guestImport';
import { useData } from '../../../context/DataContext';

jest.mock('react-native-document-picker');
jest.mock('../../../services/guestImport');
jest.mock('../../../context/DataContext');
jest.mock('react-native-fs', () => ({ readFile: jest.fn() }));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

(useData as jest.Mock).mockReturnValue({ house: { id: 'house-1' } });
(importService.parseGuestCsv as jest.Mock).mockReturnValue([
  {
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    sobrietyDate: '2025-01-15',
    drugOfChoice: 'Alcohol',
  },
]);
(importService.importGuestsFromRows as jest.Mock).mockResolvedValue(1);

it('shows pick CSV button', () => {
  const { getByTestId } = render(<GuestImportScreen />);
  expect(getByTestId('pick-csv-button')).toBeTruthy();
});

it('shows preview after file picked and parsed', async () => {
  (DocumentPicker.pick as jest.Mock).mockResolvedValue([
    { uri: 'file://test.csv', name: 'test.csv' },
  ]);
  const RNFS = require('react-native-fs');
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
  const RNFS = require('react-native-fs');
  RNFS.readFile.mockResolvedValue(
    'firstName,lastName,email,sobrietyDate,drugOfChoice\nJane,Smith,jane@example.com,2025-01-15,Alcohol',
  );

  const { getByTestId, getByText } = render(<GuestImportScreen />);
  fireEvent.press(getByTestId('pick-csv-button'));
  await waitFor(() => getByTestId('import-button'));
  fireEvent.press(getByTestId('import-button'));
  await waitFor(() => expect(getByText(/1 resident/i)).toBeTruthy());
});
