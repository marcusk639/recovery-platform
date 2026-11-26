/**
 * A resident's own rent rate (rent spec §4.2, §4.6). Typed in DOLLARS, stored in
 * CENTS with the schedule it was set for, so $600/month can never be read as
 * $600/week. Managers and above set it; a peer leader and the resident never do.
 */
// The shared check (houseTierQueries.test.ts pins rank and own record).
let mockMayEdit = true;
let mockSignedIn = 'manager-uid';
jest.mock('../../../state/queries/houseTierQueries', () => ({
  useMayEditGuestMoney: (guest: { userId?: string }) => mockMayEdit && guest.userId !== mockSignedIn,
}));

const mockUpdateGuest = jest.fn((..._args: any[]) => Promise.resolve());
jest.mock('../../../state/queries/guestQueries', () => ({
  useUpdateGuest: () => ({ mutateAsync: mockUpdateGuest, isPending: false }),
}));

jest.mock('../../../context', () => ({
  useTheme: () => ({ theme: { primaryFontFamily: 'System' } }),
  useTranslation: () => ({ t: (k: string) => k }),
}));

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CustomRentField from '../CustomRentField';

const house = (fields: Record<string, unknown> = {}) =>
  ({
    id: 'h1',
    houseType: 'traditional',
    rentFrequency: 'monthly',
    monthlyRent: 800,
    weeklyRent: 175,
    ...fields,
  }) as any;
const guest = (fields: Record<string, unknown> = {}) =>
  ({ id: 'g1', houseId: 'h1', userId: 'resident-uid', customRent: null, ...fields }) as any;

const renderField = (g = guest(), h = house(), signedIn = 'manager-uid') => {
  mockSignedIn = signedIn;
  return render(<CustomRentField guest={g} house={h} />);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMayEdit = true;
});

describe('CustomRentField', () => {
  it('$600 under a monthly house writes { amountCents: 60000, frequency: monthly }', async () => {
    const view = renderField();
    fireEvent.changeText(view.getByTestId('custom-rent-input'), '600');
    fireEvent.press(view.getByTestId('custom-rent-save'));
    await waitFor(() =>
      expect(mockUpdateGuest).toHaveBeenCalledWith({
        guest: expect.objectContaining({ id: 'g1' }),
        updatedGuest: {
          id: 'g1',
          houseId: 'h1',
          customRent: { amountCents: 60000, frequency: 'monthly' },
        },
      }),
    );
  });

  it('$175 under a weekly house is stored as a weekly rate', async () => {
    const view = renderField(guest(), house({ rentFrequency: 'weekly' }));
    fireEvent.changeText(view.getByTestId('custom-rent-input'), '175');
    fireEvent.press(view.getByTestId('custom-rent-save'));
    await waitFor(() =>
      expect(mockUpdateGuest.mock.calls[0][0].updatedGuest.customRent).toEqual({
        amountCents: 17500,
        frequency: 'weekly',
      }),
    );
  });

  it('allows $0, a scholarship bed', async () => {
    const view = renderField();
    fireEvent.changeText(view.getByTestId('custom-rent-input'), '0');
    fireEvent.press(view.getByTestId('custom-rent-save'));
    await waitFor(() =>
      expect(mockUpdateGuest.mock.calls[0][0].updatedGuest.customRent).toEqual({
        amountCents: 0,
        frequency: 'monthly',
      }),
    );
  });

  it('clearing writes null, back to the house price', async () => {
    const view = renderField(guest({ customRent: { amountCents: 60000, frequency: 'monthly' } }));
    fireEvent.press(view.getByTestId('custom-rent-clear'));
    await waitFor(() =>
      expect(mockUpdateGuest.mock.calls[0][0].updatedGuest).toEqual({
        id: 'g1',
        houseId: 'h1',
        customRent: null,
      }),
    );
  });

  it('under a weekly house, a monthly own rate shows "Not used while rent is weekly"', () => {
    const view = renderField(
      guest({ customRent: { amountCents: 60000, frequency: 'monthly' } }),
      house({ rentFrequency: 'weekly' }),
    );
    expect(
      view.getByText('Own rate: $600.00 a month. Not used while rent is weekly.'),
    ).toBeTruthy();
  });

  it('shows the rate in use and the house price otherwise', () => {
    expect(
      renderField(guest({ customRent: { amountCents: 60000, frequency: 'monthly' } })).getByText(
        'Own rate: $600.00 a month',
      ),
    ).toBeTruthy();
    expect(renderField().getByText('Pays the house price: $800.00 a month')).toBeTruthy();
  });

  it('refuses a weekly rate above $2,500 before writing', () => {
    const view = renderField(guest(), house({ rentFrequency: 'weekly' }));
    fireEvent.changeText(view.getByTestId('custom-rent-input'), '2600');
    fireEvent.press(view.getByTestId('custom-rent-save'));
    expect(view.getByText('A weekly rate can be at most $2,500')).toBeTruthy();
    expect(mockUpdateGuest).not.toHaveBeenCalled();
  });

  it('asks for the house schedule first while charging is off', () => {
    const view = renderField(guest(), house({ rentFrequency: 'both' }));
    expect(view.queryByTestId('custom-rent-input')).toBeNull();
    expect(view.getByTestId('custom-rent-needs-schedule')).toBeTruthy();
  });

  it('is hidden from a peer leader', () => {
    mockMayEdit = false;
    expect(renderField().queryByTestId('custom-rent-field')).toBeNull();
  });

  it("is hidden on the user's own record", () => {
    expect(
      renderField(guest(), house(), 'resident-uid').queryByTestId('custom-rent-field'),
    ).toBeNull();
  });

  it('says so when the save is refused', async () => {
    mockUpdateGuest.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'permission-denied' }),
    );
    const view = renderField();
    fireEvent.changeText(view.getByTestId('custom-rent-input'), '600');
    fireEvent.press(view.getByTestId('custom-rent-save'));
    expect(await view.findByText("Couldn't save the rate. Try again.")).toBeTruthy();
  });
});
