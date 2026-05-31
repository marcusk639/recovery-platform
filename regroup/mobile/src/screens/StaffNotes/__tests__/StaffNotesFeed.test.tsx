jest.mock('../../../state/queries/staffNoteQueries', () => {
  const useResidentNotes = jest.fn();
  const useShiftLogs = jest.fn();
  const mutateAsyncAdd = jest.fn().mockResolvedValue('new-id');
  const mutateAsyncDelete = jest.fn().mockResolvedValue(undefined);
  const mutateAsyncPin = jest.fn().mockResolvedValue(undefined);
  return {
    staffNoteKeys: {},
    useResidentNotes,
    useShiftLogs,
    useAddStaffNote: () => ({ mutateAsync: mutateAsyncAdd }),
    useDeleteStaffNote: () => ({ mutateAsync: mutateAsyncDelete }),
    usePinStaffNote: () => ({ mutateAsync: mutateAsyncPin }),
    _mutateAsyncAdd: mutateAsyncAdd,
    _mutateAsyncDelete: mutateAsyncDelete,
    _mutateAsyncPin: mutateAsyncPin,
  };
});

jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));
jest.mock('../../../components/screen-header', () => 'ScreenHeader');
jest.mock('../../../components/empty-screen', () => 'EmptyScreen');
jest.mock('../../../components/rats-icon', () => ({
  RatsIcon: 'RatsIcon',
  ClickableIcon: 'ClickableIcon',
}));
jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text, ...rest }: any) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, rest, text);
  },
}));
jest
  .spyOn(require('react-native').Alert, 'alert')
  .mockImplementation((_title: string, _msg?: string, buttons?: any[]) => {
    // Auto-confirm destructive prompts by invoking the second button's onPress.
    if (Array.isArray(buttons) && buttons[1]?.onPress) buttons[1].onPress();
  });

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import StaffNotesFeed from '../StaffNotesFeed';
import {
  useResidentNotes,
  useShiftLogs,
} from '../../../state/queries/staffNoteQueries';
const queries = require('../../../state/queries/staffNoteQueries') as any;

const makeProps = (overrides: Partial<any> = {}) => ({
  route: {
    params: {
      houseId: 'h',
      type: 'resident_note' as const,
      guestId: 'g',
      guestName: 'Bob',
      ...overrides,
    },
  },
  navigation: { goBack: jest.fn(), navigate: jest.fn() },
});

beforeEach(() => {
  jest.clearAllMocks();
  (useResidentNotes as jest.Mock).mockReturnValue({
    data: [],
    isLoading: false,
  });
  (useShiftLogs as jest.Mock).mockReturnValue({ data: [], isLoading: false });
});

describe('StaffNotesFeed — resident_note', () => {
  it('renders the empty state when no notes exist', () => {
    const { getByTestId } = render(
      <StaffNotesFeed {...(makeProps() as any)} />,
    );
    expect(getByTestId('staff-notes-feed-screen')).toBeTruthy();
  });

  it('renders the list when notes are present', () => {
    (useResidentNotes as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'n1',
          houseId: 'h',
          guestId: 'g',
          type: 'resident_note',
          content: 'observation',
          authorId: 'a',
          authorName: 'Alice',
          createdAt: '2026-05-20T10:00:00.000Z',
          pinned: false,
        },
      ],
      isLoading: false,
    });
    const { getByTestId } = render(
      <StaffNotesFeed {...(makeProps() as any)} />,
    );
    expect(getByTestId('staff-note-row-n1')).toBeTruthy();
  });

  it('disables submit when the draft is empty', () => {
    const { getByTestId } = render(
      <StaffNotesFeed {...(makeProps() as any)} />,
    );
    const submit = getByTestId('staff-note-submit');
    expect(
      submit.props.accessibilityState?.disabled || submit.props.disabled,
    ).toBeTruthy();
  });

  it('submits a new note with guestId on type=resident_note', async () => {
    const { getByTestId } = render(
      <StaffNotesFeed {...(makeProps() as any)} />,
    );
    fireEvent.changeText(getByTestId('staff-note-input'), 'New observation');
    fireEvent.press(getByTestId('staff-note-submit'));
    await waitFor(() => {
      expect(queries._mutateAsyncAdd).toHaveBeenCalledWith({
        type: 'resident_note',
        content: 'New observation',
        guestId: 'g',
      });
    });
  });

  it('confirms before deletion and forwards noteId + guestId', async () => {
    (useResidentNotes as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'n1',
          houseId: 'h',
          guestId: 'g',
          type: 'resident_note',
          content: 'x',
          authorId: 'a',
          authorName: 'Alice',
          createdAt: '2026-05-20T10:00:00.000Z',
          pinned: false,
        },
      ],
      isLoading: false,
    });
    const { getByTestId } = render(
      <StaffNotesFeed {...(makeProps() as any)} />,
    );
    fireEvent.press(getByTestId('staff-note-delete-n1'));
    await waitFor(() =>
      expect(queries._mutateAsyncDelete).toHaveBeenCalledWith({
        noteId: 'n1',
        guestId: 'g',
      }),
    );
  });

  it('toggles pin state', async () => {
    (useResidentNotes as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'n1',
          houseId: 'h',
          guestId: 'g',
          type: 'resident_note',
          content: 'x',
          authorId: 'a',
          authorName: 'Alice',
          createdAt: '2026-05-20T10:00:00.000Z',
          pinned: false,
        },
      ],
      isLoading: false,
    });
    const { getByTestId } = render(
      <StaffNotesFeed {...(makeProps() as any)} />,
    );
    fireEvent.press(getByTestId('staff-note-pin-n1'));
    await waitFor(() =>
      expect(queries._mutateAsyncPin).toHaveBeenCalledWith({
        noteId: 'n1',
        pinned: true,
        guestId: 'g',
      }),
    );
  });
});

describe('StaffNotesFeed — shift_log', () => {
  it('reads from useShiftLogs and submits without guestId', async () => {
    const { getByTestId } = render(
      <StaffNotesFeed
        {...(makeProps({
          type: 'shift_log',
          guestId: undefined,
          guestName: undefined,
        }) as any)}
      />,
    );
    expect(useShiftLogs).toHaveBeenCalledWith('h', true);
    fireEvent.changeText(getByTestId('staff-note-input'), 'Quiet shift');
    fireEvent.press(getByTestId('staff-note-submit'));
    await waitFor(() =>
      expect(queries._mutateAsyncAdd).toHaveBeenCalledWith({
        type: 'shift_log',
        content: 'Quiet shift',
        guestId: undefined,
      }),
    );
  });

  it('shows the loading indicator while fetching', () => {
    (useShiftLogs as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    const { getByTestId } = render(
      <StaffNotesFeed
        {...(makeProps({ type: 'shift_log', guestId: undefined }) as any)}
      />,
    );
    expect(getByTestId('staff-notes-loading')).toBeTruthy();
  });
});
