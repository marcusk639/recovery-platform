/**
 * The invitation screen for a user who is already signed in (SignUp shows it
 * instead of the sign-up form). A token invitation can be accepted as this
 * account; every invitation can be left with "Continue to the app".
 * services/appLinks/signedInInvitation.ts does the work.
 */
import React, { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import { useAppDispatch, useAppSelector } from '../../state/store';
import { updateUser as updateUserRTK } from '../../state/slices/userSlice';
import { useCreateGuest } from '../../state/queries/guestQueries';
import { useCreateAdmin } from '../../state/queries/adminQueries';
import { User } from '../../entities/User';
import {
  acceptInvitationAsCurrentUser,
  leaveInvitation,
} from '../../services/appLinks/signedInInvitation';
import { guestRecordExists } from '../../services/invitationMembership';
import { color, fontSize, normalize } from '../../styles/theme';

interface Props {
  /** A message from SignUp, e.g. the token could not be read (peekInvitation). */
  notice?: string;
}

const SignedInInvitation: React.FC<Props> = ({ notice }) => {
  const dispatch = useAppDispatch();
  const invitation = useAppSelector((state) => state.user.invitation);
  const user = useAppSelector((state) => state.user.user);
  const [busy, setBusy] = useState(false);
  // `busy` disables the button only after a re-render; this stops a second tap
  // before that.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync: createGuest } = useCreateGuest();
  const { mutateAsync: createAdmin } = useCreateAdmin();

  if (!invitation) return null;
  const token = invitation.token;
  const roleLabel =
    invitation.type === 'senior-peer'
      ? 'Peer leader'
      : invitation.type === 'admin'
      ? 'Manager'
      : 'Guest';
  const message = error ?? notice ?? null;

  const accept = async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const result = await acceptInvitationAsCurrentUser(invitation, {
      dispatch,
      user,
      writers: {
        createGuest,
        createAdmin,
        updateUser: (u: User, updates: Partial<User>) =>
          dispatch(updateUserRTK({ user: u, updates })).unwrap(),
        guestExists: guestRecordExists,
      },
    });
    if (!result.ok) {
      inFlight.current = false;
      setError(result.message);
      setBusy(false);
    }
  };

  return (
    <View testID="signed-in-invitation" style={{ padding: normalize(15) }}>
      <View
        testID="invitation-info"
        style={{
          backgroundColor: color.light_grey,
          padding: normalize(15),
          marginBottom: normalize(15),
          borderRadius: normalize(5),
        }}
      >
        <RatsText
          style={{ fontSize: fontSize.regular_medium, color: color.dark_grey }}
          text="You've been invited!"
        />
        {(invitation as { houseName?: string }).houseName ? (
          <RatsText text={`House: ${(invitation as { houseName?: string }).houseName}`} />
        ) : null}
        <RatsText testID="invited-as-role" text={`Role: ${roleLabel}`} />
      </View>
      {message ? (
        <RatsText
          testID="accept-invitation-error"
          style={{ color: color.red, marginBottom: normalize(10) }}
          text={message}
        />
      ) : null}
      {busy ? <ActivityIndicator size="large" color={color.baby_blue} /> : null}
      {token ? (
        <RatsButton
          testID="accept-invitation-button"
          title="Accept as this account"
          disabled={busy}
          onPress={accept}
        />
      ) : (
        <RatsText
          testID="legacy-invitation-note"
          text="To accept this invitation, sign out and sign up with the email it was sent to."
        />
      )}
      <RatsButton
        light
        testID="continue-to-app-button"
        title="Continue to the app"
        disabled={busy}
        containerStyle={{ marginTop: normalize(10) }}
        onPress={() => leaveInvitation(dispatch, user)}
      />
    </View>
  );
};

export default SignedInInvitation;
