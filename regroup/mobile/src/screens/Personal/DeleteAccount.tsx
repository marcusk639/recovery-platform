import React, { useCallback, useState } from "react";
import { View, TextInput, StyleSheet } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ScreenHeader from "../../components/screen-header";
import RatsScrollView from "../../components/rats-scroll-view";
import RatsButton from "../../components/rats-button/rats-button";
import { RatsText } from "../../components/rats-text";
import { color } from "../../styles/theme";
import { Routes, RootStackParamList } from "../../navigation/types";
import { deleteMyAccount } from "../../services/account";
import { logException } from "../../util/logging";
import { useAppDispatch } from "../../state/store";
import { logout as logoutThunk } from "../../state/slices/userSlice";

const WRONG_PASSWORD_CODES = ["auth/wrong-password", "auth/invalid-credential"];
const WRONG_PASSWORD_MESSAGE = "That password is incorrect.";
const GENERIC_MESSAGE = "We couldn't delete your account. Try again.";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const DeleteAccount: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch();
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMyAccount(password);
    } catch (err: any) {
      if (WRONG_PASSWORD_CODES.includes(err?.code)) {
        setError(WRONG_PASSWORD_MESSAGE);
      } else {
        logException(err, "Failed to delete account");
        setError(GENERIC_MESSAGE);
      }
      setDeleting(false);
      return;
    }
    // Account is gone and auth is signed out; reset app state like Log Out.
    navigation.navigate(Routes.PriorAuth as never);
    try {
      await dispatch(logoutThunk());
    } catch (err) {
      logException(err, "Failed to reset state after account deletion");
    }
  }, [deleting, password, navigation, dispatch]);

  return (
    <RatsScrollView>
      <ScreenHeader renderBackButton header="Delete account" />
      <View style={styles.container}>
        <RatsText
          style={styles.desc}
          text="This permanently deletes your Regroup login and personal information. Your house keeps the records it needs for rent and compliance, without your contact or health details. If you own houses, your subscription is cancelled now and your houses are closed. This cannot be undone."
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
