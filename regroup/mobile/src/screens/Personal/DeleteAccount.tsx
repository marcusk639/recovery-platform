import React, { useCallback, useState } from "react";
import { Alert, View, TextInput, StyleSheet } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ScreenHeader from "../../components/screen-header";
import RatsScrollView from "../../components/rats-scroll-view";
import RatsButton from "../../components/rats-button/rats-button";
import { RatsText } from "../../components/rats-text";
import { color } from "../../styles/theme";
import { Routes, RootStackParamList } from "../../navigation/types";
import { deleteMyAccount, DELETION_UNCONFIRMED_CODE } from "../../services/account";
import { logException } from "../../util/logging";
import { useAppDispatch } from "../../state/store";
import { logout as logoutThunk } from "../../state/slices/userSlice";

const WRONG_PASSWORD_CODES = ["auth/wrong-password", "auth/invalid-credential"];
const WRONG_PASSWORD_MESSAGE = "That password is incorrect.";
const GENERIC_MESSAGE = "We couldn't delete your account. Try again.";
/** Callable codes whose message is written for the user (stale sign-in, demo account). */
const SERVER_MESSAGE_CODES = ["permission-denied", "failed-precondition"];
export const DELETE_ACCOUNT_DESCRIPTION =
  "This permanently deletes your Regroup login, your profile, notifications, applications, feedback, uploaded documents, and direct messages you sent. Your house keeps your name, dates and rent records for its records, without your contact, recovery or health details. Messages you posted in house group chat stay. If you hold a house officer role, your seat is vacated; votes you cast still count but are no longer linked to you. If you have a Regroup subscription it is cancelled immediately, and houses you own are closed. This cannot be undone.";

/** RN Firebase reports callable codes bare or `functions/`-prefixed depending on version. */
const callableCode = (err: any): string | undefined =>
  typeof err?.code === "string" ? err.code.replace(/^functions\//, "") : undefined;

/** The message to show for a failed deletion, or null for the generic one. */
function knownFailureMessage(err: any): string | null {
  if (WRONG_PASSWORD_CODES.includes(err?.code)) return WRONG_PASSWORD_MESSAGE;
  const code = callableCode(err);
  const hasMessage = typeof err?.message === "string" && err.message.length > 0;
  if (hasMessage && code && SERVER_MESSAGE_CODES.includes(code)) return err.message;
  if (hasMessage && err?.details?.partial === true) return err.message;
  return null;
}

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const DeleteAccount: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch();
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth is signed out at this point; reset app state like Log Out.
  const leaveSignedOut = useCallback(async () => {
    navigation.navigate(Routes.PriorAuth as never);
    try {
      await dispatch(logoutThunk());
    } catch (err) {
      logException(err, "Failed to reset state after account deletion");
    }
  }, [navigation, dispatch]);

  const onDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMyAccount(password);
    } catch (err: any) {
      if (err?.code === DELETION_UNCONFIRMED_CODE) {
        // Already signed out by deleteMyAccount; the user must sign in to check.
        Alert.alert("Delete account", err.message);
        await leaveSignedOut();
        return;
      }
      const known = knownFailureMessage(err);
      // Wrong password, stale sign-in and the demo account are expected outcomes.
      if (!known || err?.details?.partial === true) {
        logException(err, "Failed to delete account");
      }
      setError(known ?? GENERIC_MESSAGE);
      setDeleting(false);
      return;
    }
    await leaveSignedOut();
  }, [deleting, password, leaveSignedOut]);

  return (
    <RatsScrollView>
      <ScreenHeader renderBackButton header="Delete account" />
      <View style={styles.container}>
        <RatsText
          style={styles.desc}
          text={DELETE_ACCOUNT_DESCRIPTION}
        />
        <RatsText style={styles.label} text="Password" />
        <TextInput
          testID="delete-password-input"
          style={styles.input}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          value={password}
          onChangeText={setPassword}
          editable={!deleting}
        />
        {error && (
          <RatsText testID="delete-account-error" style={styles.error} text={error} />
        )}
        <RatsButton
          testID="delete-account-button"
          title="Delete my account"
          disabled={deleting || password.length === 0}
          onPress={onDelete}
          containerStyle={{
            backgroundColor: color.red,
            borderColor: color.red,
          }}
        />
      </View>
    </RatsScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20 },
  desc: { fontSize: 15, marginBottom: 16 },
  label: { fontSize: 15, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    marginBottom: 16,
  },
  error: { color: color.red, marginBottom: 16 },
});

export default DeleteAccount;
