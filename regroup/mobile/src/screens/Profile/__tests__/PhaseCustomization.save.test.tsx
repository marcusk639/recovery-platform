// Phase Customization only goes back once the phase is saved (#218).
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import PhaseCustomization from '../PhaseCustomization';

jest.mock('../../../context', () => ({
  useNotification: () => ({ showPopover: jest.fn(), setPopoverRef: jest.fn() }),
  useTheme: () => ({
    theme: {
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
      primaryColor: '#000',
      secondaryColor: '#fff',
      tertiaryColor: '#ccc',
      backgroundColor: '#fff',
      textColor: '#000',
      logoTintColor: '#fff',
    },
  }),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => ({
    house: { id: 'house-1', phases: { 'Phase 1': { name: 'Phase 1', rules: {} } } },
  }),
}));
jest.mock('../../../hooks/useSelectedGuest', () => ({
  useSelectedGuest: () => ({ guest: { id: 'g1', houseId: 'house-1', phase: 'Phase 1' } }),
}));
const mockUpdateGuest = jest.fn();
jest.mock('../../../state/queries/guestQueries', () => ({
  useGuests: () => ({ data: {} }),
  useUpdateGuest: () => ({ mutateAsync: mockUpdateGuest }),
}));
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));
jest.mock('../../../components/screen-header', () => () => null);
jest.mock('../../../components/help-icon', () => () => null);
jest.mock('../../../components/rats-modal', () => () => null);
jest.mock('../../SetupWizards/PhaseSetup/PhaseConfigForm', () => ({ PhaseConfigForm: () => null }));

const navigation = { goBack: jest.fn() } as any;
const pressSave = (utils: ReturnType<typeof render>) => {
  const buttons = utils.getAllByText(/^save$/i);
  fireEvent.press(buttons[buttons.length - 1]);
};

describe('PhaseCustomization save (#218)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('a failed save says so and stays on the screen', async () => {
    mockUpdateGuest.mockRejectedValue(new Error('offline'));
    const utils = render(<PhaseCustomization navigation={navigation} />);
    pressSave(utils);
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Couldn't save the phase",
        'Check your connection and try again.',
      ),
    );
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('a successful save goes back', async () => {
    mockUpdateGuest.mockResolvedValue({});
    const utils = render(<PhaseCustomization navigation={navigation} />);
    pressSave(utils);
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(mockUpdateGuest).toHaveBeenCalledWith({
      guest: expect.objectContaining({ id: 'g1' }),
      updatedGuest: { id: 'g1', phase: 'Phase 1' },
    });
  });
});
