import React, { useState, useCallback } from "react";
import RatsScrollView from "../../components/rats-scroll-view";
import { SetupHeader } from "../SetupWizards/OperatorSetupWizard";
import { Guests, Admins } from "../../types";
import { House } from "../../entities/House";
import map from "lodash/map";
import each from "lodash/each";
import size from "lodash/size";
import cloneDeep from "lodash/cloneDeep";
import RatsButton from "../../components/rats-button/rats-button";
import { View } from "react-native";
import { ActivityItemWithButtons } from "../../components/card-list/card-list";
import {
  normalize,
  fontSize,
  color,
  RED_BUTTON,
  RED_BUTTON_TEXT,
  CARD_STYLE,
} from "../../styles/theme";
import { formatName } from "../../util/display";
// Phase 3.3: Migrated from withFormModal HOC to useModal hook
import { useModal } from "../../context";
import AddManager from "./AddManager";
import ConfirmationButtons from "../../components/confirmation-buttons";
import { Guest } from "../../entities/Guest";
import Admin from "../../entities/Admin";
import {
  updateHouseData,
  setGuests,
  setAdmins,
} from "../../state/slices/setupSlice";
import {
  removeAdminPrivilegesForGuests,
  removeAdminPrivileges,
} from "../../services/house";
import { useUpdateGuest } from "../../state/queries/guestQueries";
import { useUpdateHouse } from "../../state/queries/houseQueries";
import { logException } from "../../util/logging";
import { isSuperAdmin } from "../../util/admin";
import { uniquify } from "../../util/unique";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAppSelector, useAppDispatch } from "../../state/store";

interface Props {
  initializeHouseSetup: () => void;
  handleSubmit: (house: House) => void;
  navigation: NativeStackNavigationProp<RootStackParamList>;
  onPrevPress?: () => void;
}

/**
 * Manager Settings Screen
 *
 * Manages administrators and guest admins for a house.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * @migrated Phase 3.3 - Replaced withFormModal HOC with useModal hook
 */
const ManagerSettings: React.FC<Props> = (props) => {
  const { showFormModal, dismissFormModal } = useModal();
  const { initializeHouseSetup, handleSubmit, navigation, onPrevPress } = props;

  const dispatch = useAppDispatch();
  const allGuests = useAppSelector((state) => state.setup?.guests || {});
  const allAdmins = useAppSelector((state) => state.setup?.admins || {});
  const house = useAppSelector((state) => state.setup?.selectedHouse);

  const [newAdminEmails, setNewAdminEmails] = useState<string[]>([]);

  // Compute guestAdmins and admins from Redux state
  const guestAdmins: Record<string, any> = {};
  each(allGuests, (guest) => {
    if (guest.isAdmin) {
      guestAdmins[guest.id] = guest;
    }
  });

  const admins: Record<string, any> = {};
  if (house && house?.id) {
    each(allAdmins, (admin) => {
      if (admin.houseIds && admin.houseIds.includes(house?.id)) {
        admins[admin.id] = admin;
      }
    });
  }

  const updateGuestMutation = useUpdateGuest();
  const updateHouseMutation = useUpdateHouse();

  const removeAdmin = useCallback(
    async (admin: Guest | Admin) => {
      if (!house) return;

      if (allGuests[admin.id]) {
        const guest = cloneDeep(allGuests[admin.id]);
        guest.isAdmin = false;
        // Hardened 2026-07-05: this computed `guest` with isAdmin=false but
        // never used it — only dispatched an unchanged house clone, so the
        // guest stayed admin forever (no error, no revert). Revoke the real
        // admin claim and persist the guest doc, same as AddManager's
        // promote path, then sync local state.setup.guests for the UI.
        try {
          await removeAdminPrivilegesForGuests([guest]);
          await updateGuestMutation.mutateAsync({
            guest,
            updatedGuest: { id: guest.id, isAdmin: false },
          });
          dispatch(setGuests({ ...allGuests, [guest.id]: guest }));
        } catch (error) {
          logException(error, "Failed to remove guest administrator");
        }
      }
      if (allAdmins[admin.id]) {
        const _admins = cloneDeep(allAdmins);
        const _house = cloneDeep(house);
        const _admin = _admins[admin.id];
        const index = _admin.houseIds.findIndex(
          (houseId) => houseId === house.id,
        );
        const houseIndex = house.adminIds.findIndex(
          (adminId) => adminId === admin.id,
        );
        if (index > -1) {
          _admin.houseIds.splice(index, 1);
        }
        if (houseIndex > -1) {
          _house.adminIds.splice(houseIndex, 1);
        }
        // Hardened 2026-07-05: this only ever dispatched a locally-mutated
        // house clone — it never persisted to Firestore (relying on the
        // operator separately pressing "Save" afterward) and never called
        // the Cloud Function that revokes the admin's custom claim, so a
        // "removed" admin kept real access to the house until their claim
        // was separately revoked.
        //
        // Hardened 2026-07-07: this used to persist via `handleSubmit(_house)`
        // — HouseSettings.tsx's generic form-submission handler, which
        // unconditionally calls dismissFormModal() first. That closed the
        // entire Manager Settings screen after removing a single real admin
        // (identical to pressing Save), while the guest-admin branch above
        // does not dismiss — an operator removing multiple admins in one
        // sitting got silently kicked out after the first real admin. Persist
        // directly through the same mutation handleSubmit wraps, without the
        // dismiss, so both removal paths behave the same way. Also drops the
        // redundant second dispatch(updateHouseData(_house)) that duplicated
        // what this mutation's own onSuccess already syncs.
        try {
          const wasSuperAdmin = isSuperAdmin(admin, house.id);
          await removeAdminPrivileges(
            admin as Admin,
            wasSuperAdmin ? [] : [house.id],
            wasSuperAdmin ? [house.id] : [],
          );
          await updateHouseMutation.mutateAsync({
            houseId: _house.id,
            values: _house,
          });
          dispatch(updateHouseData(_house));
          dispatch(setAdmins(_admins));
        } catch (error) {
          logException(error, "Failed to remove administrator");
        }
      }
    },
    [
      allGuests,
      allAdmins,
      house,
      dispatch,
      updateGuestMutation,
      updateHouseMutation,
    ],
  );

  const renderAdmins = useCallback(() => {
    const _admins = { ...admins, ...guestAdmins };
    const adminLength = size(admins);
    let i = 0;
    return (
      <View>
        {map(_admins, (admin) => {
          //@ts-ignore
          const description = isSuperAdmin(admin, house?.id)
            ? "Operator"
            : i > adminLength - 1
              ? "Guest Administrator"
              : "Administrator";
          i++;
          return (
            <ActivityItemWithButtons
              key={admin.id}
              leftButtonTitle="Remove"
              leftButtonAction={() => removeAdmin(admin)}
              leftButtonContainerStyle={RED_BUTTON}
              disableButtons={isSuperAdmin(admin, house?.id || "")}
              leftButtonTextStyle={RED_BUTTON_TEXT}
              avatarStyle={{ borderRadius: normalize(3) }}
              container={{
                marginBottom: normalize(10),
                backgroundColor: color.white,
              }}
              avatarName={formatName(admin.firstName, admin.lastName)}
              avatarUrl={admin.avatar}
              descriptionHeader={formatName(admin.firstName, admin.lastName)}
              description={description}
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
          );
        })}
      </View>
    );
  }, [admins, guestAdmins, house, removeAdmin]);

  const addAdminEmail = useCallback((email: string) => {
    setNewAdminEmails((prev) => [...prev, email]);
  }, []);

  const renderAddManagerForm = useCallback(() => {
    showFormModal(
      <AddManager
        house={house}
        dismissModal={dismissFormModal}
        guests={allGuests}
        addAdminEmail={addAdminEmail}
      />,
      "Add Manager",
      true,
    );
  }, [showFormModal, house, dismissFormModal, allGuests, addAdminEmail]);

  const renderButton = useCallback(() => {
    return (
      <RatsButton
        testID="add-manager-button"
        containerStyle={{ marginTop: normalize(5) }}
        title="Add Manager"
        light
        onPress={renderAddManagerForm}
      />
    );
  }, [renderAddManagerForm]);

  const removeEmail = useCallback(
    (email: string, index: number) => {
      if (!house) return;

      if (
        house.pendingAdminInvites &&
        house.pendingAdminInvites.findIndex(
          (inviteEmail) => inviteEmail.toLowerCase() === email.toLowerCase(),
        ) > -1
      ) {
        const inviteIndex = house.pendingAdminInvites.findIndex(
          (inviteEmail) => inviteEmail.toLowerCase() === email.toLowerCase(),
        );
        const pendingAdminInvites = house.pendingAdminInvites.slice();
        pendingAdminInvites.splice(inviteIndex, 1);
        dispatch(updateHouseData({ ...house, pendingAdminInvites }));
      } else {
        const emails = newAdminEmails.slice();
        emails.splice(index, 1);
        setNewAdminEmails(emails);
      }
    },
    [house, newAdminEmails, dispatch],
  );

  const renderNewInvites = useCallback(() => {
    const emails = [...newAdminEmails];
    if (house?.pendingAdminInvites) {
      emails.push(...house?.pendingAdminInvites);
    }
    return (
      <View>
        {uniquify(emails).map((email, index) => {
          return (
            <ActivityItemWithButtons
              key={email}
              leftButtonTitle="Remove"
              leftButtonAction={() => removeEmail(email, index)}
              leftButtonContainerStyle={RED_BUTTON}
              leftButtonTextStyle={RED_BUTTON_TEXT}
              container={{
                marginBottom: normalize(10),
                backgroundColor: color.white,
              }}
              boxedIconName="envelope"
              boxedIconBackground={color.baby_blue}
              descriptionHeader={email}
              description="New Administrator Invitation"
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
          );
        })}
      </View>
    );
  }, [newAdminEmails, house, removeEmail]);

  const submit = useCallback(() => {
    if (!house) return;

    const houseClone = cloneDeep(house);
    if (newAdminEmails && newAdminEmails.length) {
      houseClone.pendingAdminInvites = houseClone.pendingAdminInvites
        ? [...houseClone.pendingAdminInvites, ...newAdminEmails]
        : newAdminEmails;
      houseClone.pendingAdminInvites = uniquify(houseClone.pendingAdminInvites);
    }
    handleSubmit(houseClone);
  }, [newAdminEmails, house, handleSubmit]);

  return (
    <View style={{ flex: 1 }}>
      <RatsScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <SetupHeader
          header="Managers"
          text="Invite new managers to your home or give a trusted guest a managerial role within your home."
        >
          {renderAdmins()}
          {renderNewInvites()}
          {renderButton()}
        </SetupHeader>
      </RatsScrollView>
      <ConfirmationButtons
        container={{
          ...CARD_STYLE,
          marginTop: "auto",
          paddingBottom: normalize(20),
        }}
        confirm={submit}
        cancel={onPrevPress || (() => {})}
        confirmButtonText="Save"
      />
    </View>
  );
};

export default ManagerSettings;
