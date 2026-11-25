/**
 * House Settings → Rent (rent spec §4.1, §5). A manager or owner picks Weekly,
 * Monthly or Off and a price in DOLLARS, previews what each resident would be
 * charged, then confirms. Peer leaders see it read-only, and Oxford houses have no
 * price schedule (firestore.rules houses: rentSettingsValid).
 */
const mockUseSelectedHouse = jest.fn();
jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

let mockMayEdit = true;
jest.mock('../../../state/queries/houseTierQueries', () => ({
  useMayEditRentMoney: () => mockMayEdit,
}));

const mockUpdateHouse = jest.fn(() => Promise.resolve());
jest.mock('../../../state/queries/houseQueries', () => ({
  useUpdateHouse: () => ({ mutateAsync: mockUpdateHouse, isPending: false }),
}));

let mockGuests: Record<string, unknown> = {};
jest.mock('../../../state/queries/guestQueries', () => ({
  useGuests: () => ({ data: mockGuests }),
}));

const mockPreview = jest.fn();
jest.mock('../../../state/queries/rentChargeQueries', () => ({
  useRentPreview: () => ({ mutateAsync: mockPreview, isPending: false }),
}));

jest.mock('../../../context', () => ({
  useTheme: () => ({ theme: { primaryFontFamily: 'System' } }),
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../components/screen-header', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ header }: { header: string }) => React.createElement(Text, null, header);
});

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import RentSettingsScreen from '../RentSettingsScreen';

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;

const house = (fields: Record<string, unknown> = {}) => ({
  id: 'h1',
  houseType: 'traditional',
  rentFrequency: 'both',
  weeklyRent: 0,
  monthlyRent: 0,
  ...fields,
});

const row = (fields: Record<string, unknown> = {}) => ({
  guestId: 'g1',
  label: 'Pat Q',
  nowCents: 0,
  firstDay: '2026-11-23',
  amountCents: 17500,
  daysCovered: 7,
  daysInPeriod: 7,
  rateSource: 'house',
  ...fields,
});

const renderScreen = () => render(<RentSettingsScreen navigation={navigation} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockMayEdit = true;
  mockGuests = {};
  mockUseSelectedHouse.mockReturnValue({ house: house(), houseId: 'h1', isLoading: false });
  mockPreview.mockResolvedValue({ residents: [row()] });
});

describe('RentSettingsScreen', () => {
  it('previews $175 weekly with the price in dollars, then saves weeklyRent: 175', async () => {
    const view = renderScreen();
    fireEvent.press(view.getByTestId('rent-schedule-weekly'));
    fireEvent.changeText(view.getByTestId('rent-price-input'), '175');
    fireEvent.press(view.getByTestId('rent-preview-button'));
    expect(mockPreview).toHaveBeenCalledWith({ houseId: 'h1', frequency: 'weekly', price: 175 });

    fireEvent.press(await view.findByTestId('rent-confirm-button'));
    await waitFor(() =>
      expect(mockUpdateHouse).toHaveBeenCalledWith({
        houseId: 'h1',
        values: { rentFrequency: 'weekly', weeklyRent: 175 },
      }),
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('shows each resident: $0 now and the first charge next Monday', async () => {
    const view = renderScreen();
    fireEvent.press(view.getByTestId('rent-schedule-weekly'));
    fireEvent.changeText(view.getByTestId('rent-price-input'), '175');
    fireEvent.press(view.getByTestId('rent-preview-button'));
    expect(await view.findByText('Pat Q')).toBeTruthy();
    expect(view.getByText('$0.00 now · first charge $175.00 on Mon, Nov 23')).toBeTruthy();
  });

  it('shows a prorated first charge with its days: $125.00 for 5 of 7 days', async () => {
    mockPreview.mockResolvedValue({
      residents: [row({ firstDay: '2026-11-25', amountCents: 12500, daysCovered: 5 })],
    });
    const view = renderScreen();
    fireEvent.press(view.getByTestId('rent-schedule-weekly'));
    fireEvent.changeText(view.getByTestId('rent-price-input'), '175');
    fireEvent.press(view.getByTestId('rent-preview-button'));
    expect(
      await view.findByText('$0.00 now · first charge $125.00 on Wed, Nov 25 (5 of 7 days)'),
    ).toBeTruthy();
  });

  it('a monthly price of $800 writes monthlyRent: 800', async () => {
    const view = renderScreen();
    fireEvent.press(view.getByTestId('rent-schedule-monthly'));
    fireEvent.changeText(view.getByTestId('rent-price-input'), '800');
    fireEvent.press(view.getByTestId('rent-preview-button'));
    fireEvent.press(await view.findByTestId('rent-confirm-button'));
    await waitFor(() =>
      expect(mockUpdateHouse).toHaveBeenCalledWith({
        houseId: 'h1',
        values: { rentFrequency: 'monthly', monthlyRent: 800 },
      }),
    );
  });

  it("Off writes rentFrequency 'both' and needs no preview", async () => {
    mockUseSelectedHouse.mockReturnValue({
      house: house({ rentFrequency: 'weekly', weeklyRent: 175 }),
      houseId: 'h1',
      isLoading: false,
    });
    const view = renderScreen();
    fireEvent.press(view.getByTestId('rent-schedule-off'));
    fireEvent.press(view.getByTestId('rent-save-off-button'));
    await waitFor(() =>
      expect(mockUpdateHouse).toHaveBeenCalledWith({
        houseId: 'h1',
        values: { rentFrequency: 'both' },
      }),
    );
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('refuses a weekly price typed in cents (17500) before asking the server', () => {
    const view = renderScreen();
    fireEvent.press(view.getByTestId('rent-schedule-weekly'));
    fireEvent.changeText(view.getByTestId('rent-price-input'), '17500');
    fireEvent.press(view.getByTestId('rent-preview-button'));
    expect(view.getByText('A weekly price can be at most $2,500')).toBeTruthy();
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('changing the price after a preview hides Confirm until it is previewed again', async () => {
    const view = renderScreen();
    fireEvent.press(view.getByTestId('rent-schedule-weekly'));
    fireEvent.changeText(view.getByTestId('rent-price-input'), '175');
    fireEvent.press(view.getByTestId('rent-preview-button'));
    await view.findByTestId('rent-confirm-button');
    fireEvent.changeText(view.getByTestId('rent-price-input'), '180');
    expect(view.queryByTestId('rent-confirm-button')).toBeNull();
  });

  it('starts from the saved schedule and price', () => {
    mockUseSelectedHouse.mockReturnValue({
      house: house({ rentFrequency: 'monthly', monthlyRent: 800, weeklyRent: 175 }),
      houseId: 'h1',
      isLoading: false,
    });
    const view = renderScreen();
    expect(view.getByTestId('rent-price-input').props.value).toBe('800');
    fireEvent.press(view.getByTestId('rent-schedule-weekly'));
    expect(view.getByTestId('rent-price-input').props.value).toBe('175');
  });

  it('says so when the preview fails, and saves nothing', async () => {
    mockPreview.mockRejectedValue(new Error('internal'));
    const view = renderScreen();
    fireEvent.press(view.getByTestId('rent-schedule-weekly'));
    fireEvent.changeText(view.getByTestId('rent-price-input'), '175');
    fireEvent.press(view.getByTestId('rent-preview-button'));
    expect(await view.findByText("Couldn't load the preview. Try again.")).toBeTruthy();
    expect(view.queryByTestId('rent-confirm-button')).toBeNull();
    expect(mockUpdateHouse).not.toHaveBeenCalled();
  });

  it('an Oxford house cannot choose weekly or monthly', () => {
    mockUseSelectedHouse.mockReturnValue({
      house: house({ houseType: 'oxford' }),
      houseId: 'h1',
      isLoading: false,
    });
    const view = renderScreen();
    expect(view.queryByTestId('rent-schedule-weekly')).toBeNull();
    expect(view.queryByTestId('rent-schedule-monthly')).toBeNull();
    expect(view.getByTestId('rent-oxford-note')).toBeTruthy();
  });

  it('a peer leader sees the schedule read-only', () => {
    mockMayEdit = false;
    mockUseSelectedHouse.mockReturnValue({
      house: house({ rentFrequency: 'weekly', weeklyRent: 175 }),
      houseId: 'h1',
      isLoading: false,
    });
    const view = renderScreen();
    expect(view.getByText('Weekly: $175.00 a week')).toBeTruthy();
    expect(view.getByTestId('rent-read-only-note')).toBeTruthy();
    expect(view.queryByTestId('rent-price-input')).toBeNull();
    expect(view.queryByTestId('rent-schedule-weekly')).toBeNull();
    expect(view.queryByTestId('rent-preview-button')).toBeNull();
  });
});
