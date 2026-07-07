import React, { useState } from "react";
import { Guests } from "../../types";
import { House } from "../../entities/House";
import { Guest } from "../../entities/Guest";
import { map } from "lodash";
import { View, StyleSheet, TextStyle } from "react-native";
import {
  color,
  normalize,
  fontFamily,
  fontSize,
  CARD_STYLE,
  ROW,
} from "../../styles/theme";
import Section from "../../components/rats-interactable-section";
import RatsScrollView from "../../components/rats-scroll-view";
import { RatsText } from "../../components/rats-text";
import RatsButton from "../../components/rats-button/rats-button";
import { WithNotifierProps } from "../../components/rats-hoc/withNotifier";
import { useAppSelector, useAppDispatch } from "../../state/store";
import { useSelectedHouse } from "../../hooks/useSelectedHouse";
import { updateHouseData, setGuests } from "../../state/slices/setupSlice";
import { useUpdateGuest } from "../../state/queries/guestQueries";
import { promoteGuestsToAdmin } from "../../services/house";
import { logException } from "../../util/logging";
import { renderField, validateEmail } from "../../util/form";
import RatsTextInput from "../../components/rats-text-input/rats-text-input";
import { RatsHR } from "../../components/rats-horizontal-rule";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { PartialHouseWithId } from "../../entities/House";

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "flex-start",
    backgroundColor: color.light_grey,
  },
});

interface Props extends Partial<WithNotifierProps> {
  guests: Guests;
  house: House;
  dismissModal: () => void;
  error?: Error;
  updateHouseData: (values: Partial<House>) => void;
  promoteGuestToManager: (guest: Guest) => Promise<void>;
  addAdminEmail: (email: string) => void;
  // renderBedItem: (bed: Bed, room: Room, content?: JSX.Element) => void
}

const AddManager = (props: Props) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [form, setForm] = useState<{
    touched: Record<string, boolean>;
    errors: Record<string, string>;
  }>({ touched: {}, errors: {} });

  // Get house from the RQ-backed selection (managerSignUp slice was never
  // registered in the store, so the previous state.managerSignUp?.selectedHouse
  // read was always undefined).
  const { house: houseFromState } = useSelectedHouse();
  const house = props.house || houseFromState;

  const selectGuest = (guestId: string) => {
    const alreadySelected = selected === guestId;
    if (!alreadySelected) {
      setForm({ ...form, errors: { email: "A guest has been selected" } });
    }
    setSelected(alreadySelected ? null : guestId);
    if (alreadySelected) {
      validateAndSet(email);
    }
  };

  function renderGuestSections() {
    return map(
      props.guests,
      (guest) =>
        !guest.isAdmin && (
          <Section
            key={guest.id}
            forceAvatar
            container={{ paddingHorizontal: normalize(15) }}
            avatar={guest.avatar}
            name={guest.firstName + " " + guest.lastName}
            description="Guest"
            iconBackgroundColor={color.green_blue}
            onPress={() => selectGuest(guest.id)}
            selected={selected === guest.id}
            touchableContainer={{ alignItems: "center" }}
          />
        )
    );
  }

  const validateAndSet = (value: string) => {
    if (!validateEmail(email)) {
      setForm({
        errors: { email: "Must be a valid email" },
        touched: { email: true },
      });
    } else {
      setForm({ errors: {}, touched: { email: true } });
    }
    setEmail(value);
  };

  function renderEmailField() {
    return (
      <View style={[CARD_STYLE]}>
        <RatsTextInput
          testID="manager-email-input"
          styleType="secondary"
          autoCapitalize="none"
          placeholder="Manager Email"
          labelDisabled
          form={{ errors: form.errors, touched: form.touched }}
          field={{ name: "email", value: email }}
          customHandleChange={validateAndSet}
        />
      </View>
    );
  }

  const HEADER: TextStyle = {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
    padding: normalize(15),
  };

  const [promoting, setPromoting] = useState(false);

  const submit = async () => {
    const { guests, promoteGuestToManager } = props;
    if (selected) {
      const guest = guests[selected];
      setPromoting(true);
      try {
        // Hardened 2026-07-05: this previously only dispatched setGuests(), a
        // plain setupSlice reducer with zero Firestore side effect — the
        // promotion looked immediate in this screen's list (which also reads
        // from state.setup) but reverted on next reload/re-sync since nothing
        // was ever persisted. promoteGuestToManager grants the real admin
        // claim and patches the guest's Firestore doc.
        await promoteGuestToManager(guest);
      } catch (error) {
        logException(error, "Failed to promote guest to manager");
        props.showNotification?.(
          "Something went wrong promoting this guest. Please try again.",
          "error"
        );
        setPromoting(false);
        return;
      }
      setPromoting(false);
    } else {
      props.addAdminEmail(email);
    }
    props.dismissModal();
  };

  const shouldDisableApply = () => {
    // !selected && (!form.touched || form.touched['email'] && form.errors['email'])
    const emailHasError = !!form.errors["email"];
    const emailHasBeenTouched = !!form.touched["email"];
    return (
      promoting ||
      (!selected &&
        (!Object.keys(form.touched).length ||
          (emailHasBeenTouched && emailHasError)))
    );
  };

  return (
    <View style={{ flex: 1 }} testID="add-manager-screen">
      <RatsScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        behavior="padding"
      >
        <RatsText text="INVITE NEW MANAGER" style={HEADER} />
        {renderEmailField()}
        <View
          style={[
            ROW,
            {
              justifyContent: "space-between",
              paddingTop: normalize(15),
              paddingBottom: normalize(10),
              paddingHorizontal: normalize(12),
            },
          ]}
        >
          <RatsHR
            style={{ width: "40%", borderBottomWidth: 2, alignSelf: "center" }}
          />
          <RatsText text="OR" style={{ fontSize: fontSize.medium }} />
          <RatsHR
            style={{ width: "40%", borderBottomWidth: 2, alignSelf: "center" }}
          />
        </View>
        <RatsText text="PROMOTE A GUEST" style={HEADER} />
        {renderGuestSections()}
      </RatsScrollView>
      <View
        style={[
          CARD_STYLE,
          ROW,
          {
            marginBottom: 0,
            justifyContent: "space-between",
            paddingBottom: normalize(10),
          },
        ]}
      >
        <RatsButton
          title="Cancel"
          light
          containerStyle={{ flex: 0.48 }}
          onPress={props.dismissModal}
        />
        <RatsButton
          testID="send-manager-invite-button"
          disabled={shouldDisableApply()}
          title="Apply"
          onPress={submit}
          containerStyle={{ flex: 0.48 }}
          style={{ color: color.white }}
        />
      </View>
    </View>
  );
};

/**
 * Add Manager Wrapper
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (setupActions)
 * - Added RTK imports: updateHouse from setupSlice
 * - Updated Props interface to use generic function types
 * - Replaced setupActions.updateHouse with RTK thunk dispatch
 */
const AddManagerWrapper: React.FC<any> = (props) => {
  const dispatch = useAppDispatch();
  const updateGuestMutation = useUpdateGuest();

  const promoteGuestToManager = async (guest: Guest) => {
    // Grant the real admin custom claim (security-rule relevant — see
    // isHouseAdmin() — this is separate from the Firestore guest doc field).
    await promoteGuestsToAdmin([guest]);
    // Persist the guest doc so the UI (and any future state.setup re-sync
    // from React Query) reflects the promotion instead of it reverting.
    await updateGuestMutation.mutateAsync({
      guest,
      updatedGuest: { id: guest.id, isAdmin: true },
    });
    dispatch(
      setGuests({
        ...props.guests,
        [guest.id]: { ...guest, isAdmin: true },
      })
    );
  };

  return (
    <AddManager
      {...props}
      updateHouseData={(values: Partial<House>) =>
        dispatch(updateHouseData(values))
      }
      promoteGuestToManager={promoteGuestToManager}
    />
  );
};

export default AddManagerWrapper;
