import React, { useState, useCallback } from "react";
import {
  View,
  Alert,
  ActivityIndicator,
  StyleSheet,
  TextStyle,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

import RatsScrollView from "../../components/rats-scroll-view";
import ScreenHeader from "../../components/screen-header";
import RatsButton from "../../components/rats-button/rats-button";
import { RatsText } from "../../components/rats-text";

import RatsTextInput from "../../components/rats-text-input/rats-text-input";
import {
  ActivityItemWithButtons,
  ActivityItem,
} from "../../components/card-list/card-list";

import { useAppSelector } from "../../state/store";
import { useSelectedHouse } from "../../hooks/useSelectedHouse";
import {
  useDeleteAdmin,
  useInviteAdmin,
} from "../../state/queries/adminQueries";
import { isSuperAdmin } from "../../util/admin";
import { formatName } from "../../util/display";
import { validateEmail } from "../../util/form";

import {
  color,
  fontSize,
  fontFamily,
  normalize,
  CARD_STYLE,
  RED_BUTTON,
  RED_BUTTON_TEXT,
} from "../../styles/theme";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.light_grey,
  },
  sectionHeader: {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
    padding: normalize(15),
  } as TextStyle,
  emptyText: {
    fontSize: fontSize.regular,
    color: color.grey,
    padding: normalize(15),
    textAlign: "center",
  } as TextStyle,
  inputCard: {
    ...CARD_STYLE,
    marginBottom: normalize(4),
  },
  inviteSection: {
    marginTop: normalize(8),
  },
});

const AdminManagement: React.FC<Props> = ({ navigation }) => {
  const { mutateAsync: deleteAdminMutation } = useDeleteAdmin();
  const { mutateAsync: inviteAdminMutation } = useInviteAdmin();

  const { house } = useSelectedHouse();
  const houseAdmins = useAppSelector((state) => state.admin.houseAdmins);
  const currentUser = useAppSelector((state) => state.user.user);
  const loading = useAppSelector((state) => state.admin.loading);

  const [inviteEmail, setInviteEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [inviting, setInviting] = useState(false);

  const adminList = Object.values(houseAdmins);

  const validateAndSetEmail = useCallback(
    (value: string) => {
      setInviteEmail(value);
      if (emailTouched) {
        if (!value.trim()) {
          setEmailError("");
        } else if (!validateEmail(value)) {
          setEmailError("Must be a valid email address");
        } else {
          setEmailError("");
        }
      }
    },
    [emailTouched]
  );

  const handleEmailBlur = useCallback(() => {
    setEmailTouched(true);
    if (inviteEmail && !validateEmail(inviteEmail)) {
      setEmailError("Must be a valid email address");
    }
  }, [inviteEmail]);

  const handleRemoveAdmin = useCallback(
    (adminId: string, adminName: string) => {
      if (!house) return;
      Alert.alert(
        "Remove Manager",
        `Are you sure you want to remove ${adminName} as a manager?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteAdminMutation({ adminId, houseId: house.id });
              } catch {
                Alert.alert(
                  "Error",
                  "Failed to remove manager. Please try again."
                );
              }
            },
          },
        ]
      );
    },
    [house, deleteAdminMutation]
  );

  const handleSendInvite = useCallback(async () => {
    if (!house || !inviteEmail.trim()) return;

    if (!validateEmail(inviteEmail)) {
      setEmailTouched(true);
      setEmailError("Must be a valid email address");
      return;
    }

    setInviting(true);
    try {
      await inviteAdminMutation({
        email: inviteEmail.trim().toLowerCase(),
        houseId: house.id,
        houseName: house.name || "your house",
      });
      setInviteEmail("");
      setEmailTouched(false);
      setEmailError("");
      Alert.alert(
        "Invitation Sent",
        `An invitation has been sent to ${inviteEmail.trim()}.`
      );
    } catch {
      Alert.alert("Error", "Failed to send invitation. Please try again.");
    } finally {
      setInviting(false);
    }
  }, [house, inviteEmail, inviteAdminMutation]);

  const isInviteDisabled =
    !inviteEmail.trim() ||
    !!emailError ||
    !validateEmail(inviteEmail) ||
    inviting;

  const pendingInvites: string[] = house?.pendingAdminInvites ?? [];

  if (loading && adminList.length === 0) {
    return (
      <View style={styles.container}>
        <ScreenHeader renderBackButton header="Manage Admins" />
        <ActivityIndicator
          color={color.baby_blue}
          style={{ marginTop: normalize(40) }}
          testID="admin-loading"
        />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="admin-management-screen">
      <ScreenHeader renderBackButton header="Manage Admins" />
      <RatsScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Current admins section */}
        <RatsText
          text="CURRENT MANAGERS"
          style={styles.sectionHeader}
          testID="current-managers-header"
        />

        {adminList.length === 0 ? (
          <View testID="no-admins-text">
            <RatsText
              text="No managers found for this house."
              style={styles.emptyText}
            />
          </View>
        ) : (
          <View testID="admin-list">
            {adminList.map((admin) => {
              const name =
                formatName(admin.firstName, admin.lastName) ||
                admin.email ||
                "Unknown";
              const isSuper = house?.id ? isSuperAdmin(admin, house.id) : false;
              const isSelf = admin.userId === currentUser?.id;
              const role = isSuper ? "Operator" : "Administrator";
              const canRemove = !isSuper && !isSelf;

              return (
                <View key={admin.id} testID={`admin-row-${admin.id}`}>
                  <ActivityItemWithButtons
                    leftButtonTitle="Remove"
                    leftButtonAction={() => handleRemoveAdmin(admin.id, name)}
                    leftButtonContainerStyle={RED_BUTTON}
                    leftButtonTextStyle={RED_BUTTON_TEXT}
                    disableButtons={!canRemove}
                    avatarStyle={{ borderRadius: normalize(3) }}
                    container={{
                      marginBottom: normalize(6),
                      backgroundColor: color.white,
                    }}
                    avatarName={name}
                    avatarUrl={admin.avatar}
                    descriptionHeader={name}
                    description={role}
                    descriptionStyle={{
                      fontSize: fontSize.regular,
                      color: color.dark_grey,
                    }}
                    headerStyle={{
                      fontSize: fontSize.regular_medium2,
                      color: color.black,
                      marginBottom: 2,
                    }}
                  />
                </View>
              );
            })}
          </View>
        )}

        {/* Pending invites section */}
        {pendingInvites.length > 0 && (
          <View testID="pending-invites-section">
            <RatsText
              text="PENDING INVITATIONS"
              style={styles.sectionHeader}
              testID="pending-invites-header"
            />
            {pendingInvites.map((email) => (
              <ActivityItem
                key={email}
                testID={`pending-invite-${email}`}
                container={{
                  marginBottom: normalize(6),
                  backgroundColor: color.white,
                }}
                boxedIconName="envelope"
                boxedIconBackground={color.baby_blue}
                descriptionHeader={email}
                description="Invitation Pending"
                descriptionStyle={{
                  fontSize: fontSize.regular,
                  color: color.dark_grey,
                }}
                headerStyle={{
                  fontSize: fontSize.regular_medium2,
                  color: color.black,
                  marginBottom: 2,
                }}
              />
            ))}
          </View>
        )}

        {/* Invite new manager section */}
        <View style={styles.inviteSection}>
          <RatsText
            text="INVITE NEW MANAGER"
            style={styles.sectionHeader}
            testID="invite-manager-header"
          />
          <View style={styles.inputCard}>
            <RatsTextInput
              testID="invite-email-input"
              styleType="secondary"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Manager Email Address"
              labelDisabled
              form={{
                errors: emailError ? { email: emailError } : {},
                touched: emailTouched ? { email: true } : {},
              }}
              field={{ name: "email", value: inviteEmail }}
              customHandleChange={validateAndSetEmail}
              onBlur={handleEmailBlur}
            />
          </View>
          <View style={[CARD_STYLE, { paddingTop: normalize(5) }]}>
            <RatsButton
              testID="send-invite-button"
              title={inviting ? "Sending..." : "Send Invitation"}
              disabled={isInviteDisabled}
              onPress={handleSendInvite}
              containerStyle={{ marginTop: 0 }}
            />
          </View>
        </View>
      </RatsScrollView>
    </View>
  );
};

export default AdminManagement;
