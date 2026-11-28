// Phase 3.3: Migrated from withLoadingModal HOC to useModal hook
import React, { useState, useCallback, useEffect } from "react";
import { Alert } from "react-native";
import { useModal } from "../../context";
import { GuestSetupForm } from "../SetupWizards/GuestSetup";
import { extractGuestEmails } from "../../util/house";
import { House } from "../../entities/House";
import { sendAllInvites } from "../../services/setup-wizard";
import { User } from "../../entities/User";

import ScreenHeader from "../../components/screen-header";
import { RatsAndroidResizeView } from "../../components/rats-keyboard";
import { color } from "../../styles/theme";
import { useUpdateHouse } from "../../state/queries/houseQueries";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAppSelector } from "../../state/store";
import { useSelectedHouse } from "../../hooks/useSelectedHouse";
import { logException } from "../../util/logging";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/** The addresses entered this time, normalized as extractGuestEmails stores them. */
const enteredEmails = (guestEmails: string[]): string[] =>
  Array.from(
    new Set(
      guestEmails
        .filter((email) => email && email !== "deleted")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  );

/** What the operator is told when some or all invitations were not sent. */
const notSentMessage = (unsent: number, total: number): string =>
  unsent >= total
    ? "We couldn't send the invitations. Please try again."
    : `${unsent} of ${total} invitations couldn't be sent. The addresses still in the form weren't invited; please try again.`;

/**
 * Guest Invites Screen
 *
 * Allows sending email invitations to new guests.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (houseActions)
 * - Added RTK import: updateHouse from housesSlice
 * - Fixed import path: ../../state/hooks → ../../state/store
 * - Updated 2 selectors to use RTK state (removed 'as any' casts)
 * - Replaced 1 dispatch call with RTK thunk (.unwrap() for error handling)
 * - HOCs kept for Phase 3 removal
 */
const GuestInvites: React.FC<Props> = ({ navigation }) => {
  const { setLoadingModalState } = useModal();

  const updateHouseMutation = useUpdateHouse();
  const { house } = useSelectedHouse();
  const user = useAppSelector((state) => state.user.user);

  const [sendingEmails, setSendingEmailsState] = useState(false);
  const [success, setSuccess] = useState<boolean | null>(null);

  const setSendingEmails = useCallback(
    (sending: boolean, successVal?: boolean) => {
      setSendingEmailsState(sending);
      setSuccess(successVal ?? null);
    },
    []
  );

  useEffect(() => {
    setLoadingModalState(sendingEmails, success ?? false, "Sending invites...");
  }, [sendingEmails, success, setLoadingModalState]);

  return (
    // Keeps the pinned Send Invites button above the Android keyboard.
    <RatsAndroidResizeView style={{ backgroundColor: color.light_grey }}>
      <ScreenHeader renderBackButton header="Guest Invites" />
      <GuestSetupForm
        navigation={navigation}
        showPreviousButton={false}
        completeButtonText="Send Invites"
        selectedHouse={house ?? undefined}
        onSubmit={async (values, formikBag) => {
          if (!house || !user) return;
          setSendingEmails(true);
          const emails = enteredEmails(values.guestEmails);
          const updatedHouse = extractGuestEmails(house, values.guestEmails);
          updatedHouse.pendingGuestInvites = Array.from(
            new Set([...(updatedHouse.pendingGuestInvites || [])])
          );
          try {
            // Hardened 2026-07-05: this dispatched a nonexistent
            // `updateHouse` thunk (housesSlice.ts exports no such action) —
            // TypeError: updateHouse is not a function, thrown synchronously
            // and outside the try/catch below, so pressing "Send Invites"
            // always crashed before ever calling sendAllInvites.
            await updateHouseMutation.mutateAsync({
              houseId: updatedHouse.id,
              values: updatedHouse,
            });
            // Only the addresses entered now: pendingGuestInvites keeps every
            // guest ever invited here, and re-sending them made a new
            // invitation (and held another resident slot) for each. One call
            // per address, so a failure names the addresses not sent.
            const results = await Promise.all(
              emails.map((email) =>
                sendAllInvites(
                  { [updatedHouse.id]: { ...updatedHouse, pendingGuestInvites: [email] } },
                  user as User,
                  true,
                  false,
                  false
                )
              )
            );
            const unsent = emails.filter((_, i) => results[i]?.failed);
            if (unsent.length) {
              // Counts only: the addresses are PII.
              logException(
                new Error(`${unsent.length} of ${emails.length} guest invitation(s) could not be sent`),
                "Failed to send guest invites"
              );
              setSendingEmails(false);
              formikBag?.setFieldValue?.("guestEmails", unsent);
              Alert.alert("Invitations not sent", notSentMessage(unsent.length, emails.length));
              return;
            }
            setSendingEmails(false, true);
            navigation.goBack();
          } catch (error) {
            logException(error, "Failed to send guest invites");
            setSendingEmails(false);
            Alert.alert("Invitations not sent", notSentMessage(emails.length, emails.length));
          }
        }}
      />
      <SafeAreaView
        style={{ backgroundColor: color.white }}
        edges={["bottom"]}
      />
    </RatsAndroidResizeView>
  );
};

export default GuestInvites;
