// Phase 3.3: Migrated from withLoadingModal HOC to useModal hook
import React, { useState, useCallback, useEffect } from "react";
import { useModal } from "../../context";
import { GuestSetupForm } from "../SetupWizards/GuestSetup";
import { extractGuestEmails } from "../../util/house";
import { House } from "../../entities/House";
import { sendAllInvites } from "../../services/setup-wizard";
import { User } from "../../entities/User";

import { View } from "react-native";
import ScreenHeader from "../../components/screen-header";
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
  const [failure, setFailure] = useState<boolean | null>(null);

  const setSendingEmails = useCallback(
    (sending: boolean, successVal?: boolean, failureVal?: boolean) => {
      setSendingEmailsState(sending);
      setSuccess(successVal ?? null);
      setFailure(failureVal ?? null);
    },
    []
  );

  useEffect(() => {
    setLoadingModalState(sendingEmails, success ?? false, "Sending invites...");
  }, [sendingEmails, success, setLoadingModalState]);

  return (
    <View style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader renderBackButton header="Guest Invites" />
      <GuestSetupForm
        navigation={navigation}
        showPreviousButton={false}
        completeButtonText="Send Invites"
        selectedHouse={house ?? undefined}
        onSubmit={async (values, formikBag) => {
          if (!house || !user) return;
          setSendingEmails(true, undefined, undefined);
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
            await sendAllInvites(
              { [updatedHouse.id]: updatedHouse },
              user as User,
              true,
              false,
              false
            );
            setSendingEmails(false, true, false);
            navigation.goBack();
          } catch (error) {
            logException(error, "Failed to send guest invites");
            setSendingEmails(false, false, true);
          }
        }}
      />
      <SafeAreaView
        style={{ backgroundColor: color.white }}
        edges={["bottom"]}
      />
    </View>
  );
};

export default GuestInvites;
