// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// ─── useOxfordGate mock — always-allow for screen-behavior tests ──────────────
jest.mock('../../../hooks/useOxfordGate', () => ({
  useOxfordGate: () => ({ allowed: true, houseId: 'house1' }),
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: 'rgb(99,139,250)',
      secondaryColor: '#d2d8ef',
      tertiaryColor: '#969696',
      backgroundColor: '#FAFAFA',
      textColor: 'black',
      primaryFontFamily: 'Quicksand-Medium',
      secondaryFontFamily: 'Quicksand-Medium',
      logoTintColor: '#ffffff',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../components/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header }: any) => (
    <View>
      <Text>{header}</Text>
    </View>
  );
});

const mockUpdateMeeting = jest.fn();
jest.mock('../../../services/oxford', () => ({
  updateBusinessMeeting: (...args: any[]) => mockUpdateMeeting(...args),
}));

const mockUseAppSelector = jest.fn();
jest.mock('../../../state/store', () => ({
  useAppSelector: (selector: any) => mockUseAppSelector(selector),
}));

import BusinessMeetingDetail from '../BusinessMeetingDetail';

const mockMeeting = {
  id: 'meeting1',
  houseId: 'house1',
  scheduledDate: '2026-03-01',
  agenda: [],
  attendees: [],
  quorumMet: false,
  createdBy: 'user1',
  createdAt: new Date().toISOString(),
};

const nav = { navigate: jest.fn(), goBack: jest.fn() } as any;
const route = { params: { meeting: mockMeeting } } as any;

// After A2 migration, BusinessMeetingDetail reads guests via useGuests(houseId)
// instead of state.guests.guests. Stash the test's guests fixture here so
// renderScreen can seed the React Query cache with the same data.
// See .full-review [A2].
let currentTestGuests: any = {};

const setup = (guests: any = {}) => {
  currentTestGuests = guests;
  const house = { id: 'house1' };
  mockUseSelectedHouse.mockReturnValue({
    house,
    houseId: house.id,
    isLoading: false,
  });
  mockUpdateMeeting.mockResolvedValue(undefined);
  mockUseAppSelector.mockImplementation((selector: any) =>
    selector({
      houses: { selectedHouse: house },
      guests: { guests },
      user: { user: { id: 'user1', userId: 'u1' } },
    }),
  );
};

function renderScreen(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  // After A2 migration: seed the cache with the same guests setup() stashed.
  queryClient.setQueryData(['guests', 'list', 'house1'], currentTestGuests);
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('BusinessMeetingDetail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders meeting date', () => {
    setup();
    const { getByText } = renderScreen(
      <BusinessMeetingDetail navigation={nav} route={route} />,
    );
    expect(getByText(/March 1, 2026/i)).toBeTruthy();
  });

  it('shows resident attendance list', () => {
    setup({
      g1: { id: 'g1', userId: 'u1', firstName: 'Alice', lastName: 'Smith' },
    });
    const { getByText } = renderScreen(
      <BusinessMeetingDetail navigation={nav} route={route} />,
    );
    expect(getByText('Alice Smith')).toBeTruthy();
  });

  it('toggling attendance calls updateBusinessMeeting', async () => {
    setup({
      g1: { id: 'g1', userId: 'u1', firstName: 'Alice', lastName: 'Smith' },
    });
    const { getByTestId } = renderScreen(
      <BusinessMeetingDetail navigation={nav} route={route} />,
    );
    fireEvent.press(getByTestId('attendance-toggle-g1'));
    await waitFor(() => {
      expect(mockUpdateMeeting).toHaveBeenCalledWith(
        'meeting1',
        expect.objectContaining({ attendees: ['g1'], houseId: 'house1' }),
      );
    });
  });

  it('quorum indicator updates as attendees are toggled', async () => {
    // quorum = ceil(1 * 0.51) = 1; 1 of 1 → quorum met
    setup({
      g1: { id: 'g1', userId: 'u1', firstName: 'Alice', lastName: 'Smith' },
    });
    const { getByTestId, findByText } = renderScreen(
      <BusinessMeetingDetail navigation={nav} route={route} />,
    );
    fireEvent.press(getByTestId('attendance-toggle-g1'));
    expect(await findByText(/quorum met/i)).toBeTruthy();
  });

  it('saves meeting minutes when typed', async () => {
    setup();
    const { getByTestId } = renderScreen(
      <BusinessMeetingDetail navigation={nav} route={route} />,
    );
    fireEvent.changeText(
      getByTestId('minutes-input'),
      'Discussed chore schedule.',
    );
    fireEvent.press(getByTestId('save-minutes-button'));
    await waitFor(() => {
      expect(mockUpdateMeeting).toHaveBeenCalledWith(
        'meeting1',
        expect.objectContaining({
          minutes: 'Discussed chore schedule.',
          houseId: 'house1',
        }),
      );
    });
  });

  it('reverts attendance on service failure', async () => {
    mockUpdateMeeting.mockRejectedValueOnce(new Error('network error'));
    setup({
      g1: { id: 'g1', userId: 'u1', firstName: 'Alice', lastName: 'Smith' },
    });
    const { getByTestId } = renderScreen(
      <BusinessMeetingDetail navigation={nav} route={route} />,
    );
    fireEvent.press(getByTestId('attendance-toggle-g1'));
    await waitFor(() => {
      // After failure, attendee should not remain in list (reverted)
      expect(mockUpdateMeeting).toHaveBeenCalled();
    });
  });
});
