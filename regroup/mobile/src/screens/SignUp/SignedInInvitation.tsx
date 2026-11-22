/**
 * The invitation screen for a user who is already signed in (SignUp shows it
 * instead of the sign-up form). A token invitation can be accepted as this
 * account; every invitation can be left with "Continue to the app".
 * services/appLinks/signedInInvitation.ts does the work.
 */
import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import { useAppDispatch, useAppSelector } from '../../state/store';
import {
  acceptInvitationAsCurrentUser,
  leaveInvitation,
} from '../../services/appLinks/signedInInvitation';
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
  const [error, setError] = useState<string | null>(null);

  if (!invitation) return null;
  const token = invitation.token;
  const isAdmin = invitation.type === 'admin' || invitation.type === 'senior-peer';
  const message = error ?? notice ?? null;

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    const result = await acceptInvitationAsCurrentUser(token, dispatch);
    if (!result.ok) {
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
        <RatsText testID="invited-as-role" text={`Role: ${isAdmin ? 'Manager' : 'Guest'}`} />
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
