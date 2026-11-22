/**
 * The invitation screen for a signed-in user (launch P5 Task 3, fix round 1):
 * "Accept as this account" for a token invitation, "Continue to the app" in
 * every case, and the server's refusal shown as a message.
 */
jest.mock('../../../services/appLinks/signedInInvitation', () => ({
  acceptInvitationAsCurrentUser: jest.fn(),
  leaveInvitation: jest.fn(),
}));
jest.mock('../../../services/users', () => ({}));
jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text, testID }: any) => {
    const { Text } = require('react-native');
    return <Text testID={testID}>{text || ''}</Text>;
  },
}));
jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress, testID, disabled }: any) => (
    <TouchableOpacity testID={testID} onPress={onPress} disabled={disabled}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import userReducer, { initializeInvitation } from '../../../state/slices/userSlice';
import {
  acceptInvitationAsCurrentUser,
  leaveInvitation,
} from '../../../services/appLinks/signedInInvitation';
import SignedInInvitation from '../SignedInInvitation';

const accept = acceptInvitationAsCurrentUser as jest.Mock;
const leave = leaveInvitation as jest.Mock;
const user = { uid: 'e2e-guest-b', email: 'g@rats-e2e.com', isGuest: true, isAnonymous: false };

const renderWith = (invitation: Record<string, unknown>, notice?: string) => {
  const store = configureStore({ reducer: { user: userReducer } });
  store.dispatch({ type: 'user/autoLogin/fulfilled', payload: { user, token: {} } });
  store.dispatch(initializeInvitation(invitation as any));
  return render(
    <Provider store={store}>
      <SignedInInvitation notice={notice} />
    </Provider>,
  );
};

const tokenInvitation = {
  id: '',
  type: 'admin',
  houseId: 'h1',
  email: 'g@rats-e2e.com',
  token: 'tok-1',
};
const legacyInvitation = { id: '', type: 'guest', houseId: 'h1', email: 'g@rats-e2e.com' };

beforeEach(() => jest.clearAllMocks());

describe('SignedInInvitation', () => {
  it('shows the invitation with both actions for a token invitation', () => {
    const { getByTestId, getByText } = renderWith(tokenInvitation);
    expect(getByTestId('invitation-info')).toBeTruthy();
    expect(getByText('Role: Manager')).toBeTruthy();
    expect(getByTestId('accept-invitation-button')).toBeTruthy();
    expect(getByTestId('continue-to-app-button')).toBeTruthy();
  });

  it('accepts with the token', async () => {
    accept.mockResolvedValue({ ok: true });
    const { getByTestId, queryByTestId } = renderWith(tokenInvitation);
    await act(async () => {
      fireEvent.press(getByTestId('accept-invitation-button'));
    });
    expect(accept).toHaveBeenCalledWith('tok-1', expect.any(Function));
    expect(queryByTestId('accept-invitation-error')).toBeNull();
  });

  it("shows the server's refusal and keeps both actions", async () => {
    accept.mockResolvedValue({
      ok: false,
      message: 'This invitation was sent to a different email address.',
    });
    const { getByTestId } = renderWith(tokenInvitation);
    await act(async () => {
      fireEvent.press(getByTestId('accept-invitation-button'));
    });
    expect(getByTestId('accept-invitation-error').props.children).toBe(
      'This invitation was sent to a different email address.',
    );
    expect(getByTestId('accept-invitation-button')).toBeTruthy();
    expect(getByTestId('continue-to-app-button')).toBeTruthy();
  });

  it('offers only "Continue to the app" for a legacy invitation', () => {
    const { queryByTestId, getByTestId } = renderWith(legacyInvitation);
    expect(queryByTestId('accept-invitation-button')).toBeNull();
    expect(getByTestId('legacy-invitation-note')).toBeTruthy();
    expect(getByTestId('continue-to-app-button')).toBeTruthy();
  });

  it('"Continue to the app" leaves the invitation for the signed-in user', () => {
    const { getByTestId } = renderWith(legacyInvitation);
    fireEvent.press(getByTestId('continue-to-app-button'));
    expect(leave).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ uid: 'e2e-guest-b' }),
    );
    expect(accept).not.toHaveBeenCalled();
  });

  it('shows a notice from the screen (e.g. an invalid link)', () => {
    const { getByTestId } = renderWith(tokenInvitation, 'This invitation link is no longer valid.');
    expect(getByTestId('accept-invitation-error').props.children).toBe(
      'This invitation link is no longer valid.',
    );
  });
});
