// src/screens/HouseSettings/__tests__/ChoreRotationSetupScreen.test.tsx

jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: jest.fn(() => ({
    house: {
      id: 'house1',
      chores: { Kitchen: { name: 'Kitchen', description: 'Clean kitchen.' } },
    },
    houseId: 'house1',
  })),
}));

jest.mock('../../../state/queries', () => ({
  useGuests: jest.fn(() => ({
    data: {
      guest1: {
        id: 'guest1',
        firstName: 'Alice',
        lastName: 'A',
        status: 'active',
      },
      guest2: {
        id: 'guest2',
        firstName: 'Bob',
        lastName: 'B',
        status: 'active',
      },
    },
    isLoading: false,
  })),
}));

jest.mock('../../../state/queries/choreRotationQueries', () => ({
  useChoreRotation: jest.fn(() => ({
    data: {
      choreName: 'Kitchen',
      guestIds: ['guest1', 'guest2'],
      currentIndex: 0,
      lastRotatedAt: '2026-05-17',
    },
    isLoading: false,
  })),
  useSetRotationOrder: jest.fn(() => ({
    mutateAsync: jest.fn(() => Promise.resolve()),
    isPending: false,
  })),
  useAdvanceRotation: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
}));

jest.mock('../../../../firebase-setup', () => ({
  firestore: { collection: jest.fn() },
  auth: { currentUser: { uid: 'user1' } },
}));

jest.mock('@react-navigation/native-stack', () => ({}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import {
  useSetRotationOrder,
  useAdvanceRotation,
} from '../../../state/queries/choreRotationQueries';
import ChoreRotationSetupScreen from '../ChoreRotationSetupScreen';

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

afterEach(() => jest.clearAllMocks());

describe('ChoreRotationSetupScreen', () => {
  it('renders the chore option', () => {
    const { getByTestId } = render(
      <ChoreRotationSetupScreen navigation={navigation} />,
    );
    expect(getByTestId('chore-option-Kitchen')).toBeTruthy();
  });

  it('renders both resident rows', () => {
    const { getByTestId } = render(
      <ChoreRotationSetupScreen navigation={navigation} />,
    );
    expect(getByTestId('rotation-row-0')).toBeTruthy();
    expect(getByTestId('rotation-row-1')).toBeTruthy();
  });

  it('move-up button at index 1 shifts resident up', () => {
    const { getByTestId, getByText } = render(
      <ChoreRotationSetupScreen navigation={navigation} />,
    );
    fireEvent.press(getByTestId('move-up-1'));
    // After moving up, Bob (index 1) should become index 0
    expect(getByText(/1\. Bob/)).toBeTruthy();
  });

  it('calls setRotationOrder on save', async () => {
    const mockMutateAsync = jest.fn(() => Promise.resolve());
    (useSetRotationOrder as jest.Mock).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });

    const { getByTestId } = render(
      <ChoreRotationSetupScreen navigation={navigation} />,
    );
    fireEvent.press(getByTestId('save-rotation-button'));
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        choreName: 'Kitchen',
        guestIds: expect.any(Array),
      });
    });
  });

  it('shows confirmation alert before advancing', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId } = render(
      <ChoreRotationSetupScreen navigation={navigation} />,
    );
    fireEvent.press(getByTestId('advance-rotation-button'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Advance Rotation',
      expect.any(String),
      expect.any(Array),
    );
    alertSpy.mockRestore();
  });
});
