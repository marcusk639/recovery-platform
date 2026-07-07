import React, { useState, useCallback, useEffect } from "react";
// Phase 3.3: Migrated from withHouseSetupWizard HOC to useHouseSetupWizard hook
import { useHouseSetupWizard } from "../../hooks/useHouseSetupWizard";

import { withFormik, FormikProps, FieldArray, FormikBag, Field } from "formik";
import ManagerSetupProps, { ManagerSetupWithForm } from "./ManagerSetupEntity";
import { View } from "react-native";
import { renderField, validateEmail } from "../../util/form";
import RatsTextInput from "../../components/rats-text-input/rats-text-input";
import {
  normalize,
  ROW,
  fontSize,
  CARD_STYLE,
  STAT_BUTTON,
  STAT_BUTTON_TEXT,
  color,
  SCROLL_CONTAINER,
  SAVE_BUTTON,
  RED_BUTTON,
  RED_BUTTON_TEXT,
} from "../../styles/theme";
import { each, uniqueId } from "lodash";
import { ActionButton } from "../../components/action-button";
import RatsButton from "../../components/rats-button/rats-button";
import { NEXT_BUTTON, NEXT_BUTTON_TEXT } from "./SetupStyles";
import ScreenHeader from "../../components/screen-header";
import HelpIcon from "../../components/help-icon";
import RatsScrollView from "../../components/rats-scroll-view";
import { extractGuestEmails } from "../../util/house";
import { SetupHeader, SetupButtons } from "./OperatorSetupWizard";
import { ActivityItemWithButtons } from "../../components/card-list/card-list";

const labelColor = "black";

type GuestSetupFormViewProps = ManagerSetupWithForm &
  FormikProps<GuestSetupFormValues> &
  GuestSetupScreenProps;

// Hardened 2026-07-07: this used to also call useHouseSetupWizard() here
// and use it as a default-parameter fallback for selectedHouse/updateHouse
// — redundant since the outer GuestSetup wrapper already resolves both via
// the same hook (props.selectedHouse || setupWizard.selectedHouse ||
// undefined) before this component ever renders. A second subscription to
// the same Redux state here couldn't produce a different value; it just
// obscured which component actually owns the read.
const GuestSetupFormView: React.FC<GuestSetupFormViewProps> = (props) => {
  const {
    values,
    setFieldValue,
    touched,
    showPreviousButton,
    forSettings,
    handleSubmit,
    onPrevPress,
    completeButtonText,
    selectedHouse,
    updateHouse,
    navigation,
  } = props;

  const addEmailField = useCallback(() => {
    setFieldValue("guestEmails", [...values.guestEmails, ""]);
  }, [values.guestEmails, setFieldValue]);

  const getGuestEmailsTouchedValue = useCallback(
    (index: number) => {
      if (!touched || !touched.guestEmails) return false;
      const touchedArray = touched.guestEmails;
      if (Array.isArray(touchedArray)) {
        return touchedArray[index] === true;
      }
      return (touchedArray as unknown as Record<number, boolean>)[index];
    },
    [touched]
  );

  const deleteGuest = useCallback(
    (index: number) => {
      setFieldValue(
        "guestEmails",
        values.guestEmails.filter((email, i) => index !== i)
      );
    },
    [values.guestEmails, setFieldValue]
  );

  const renderCornerIcon = useCallback(
    (index: number) => () => {
      return (
        <ActionButton
          style={{
            padding: 0,
            borderRadius: normalize(22.5),
          }}
          iconSize={fontSize.medium}
          iconName="times-circle"
          onPress={() => deleteGuest(index)}
        />
      );
    },
    [deleteGuest]
  );

  const renderEmailFields = () => {
    const { guestEmails } = values;
    if (!guestEmails || guestEmails.length === 0) {
      return null;
    }
    return (
      <FieldArray
        name="guestEmails"
        render={(arrayHelpers) =>
          guestEmails.map((email, i) => (
            <Field
              name={`guestEmails.${i}`}
              styleType="secondary"
              component={RatsTextInput}
              labelColor={labelColor}
              touchedValue={getGuestEmailsTouchedValue(i)}
              label="Email"
              sideButtonPress={() => deleteGuest(i)}
              autoCapitalize="none"
              keyboardType="email-address"
              key={`guest-email-${i}`}
            />
          ))
        }
      />
    );
  };

  const renderAddButton = () => {
    return (
      <View style={{ justifyContent: "space-between" }}>
        <RatsButton
          title="ADD GUEST"
          onPress={addEmailField}
          light
          style={STAT_BUTTON_TEXT}
          containerStyle={{
            marginBottom: normalize(10),
            marginTop: normalize(15),
          }}
        />
      </View>
    );
  };

  const renderButtons = () => {
    if (forSettings) {
      return (
        <SetupButtons
          navigation={navigation}
          rightLabel="Save"
          leftLabel="Cancel"
          rightButtonContainer={{ ...SAVE_BUTTON, width: "49%" }}
          submit={handleSubmit}
          leftPress={onPrevPress}
        />
      );
    }
    return (
      <SetupButtons
        navigation={navigation}
        leftLabel="Back"
        leftPress={onPrevPress}
        rightButtonContainer={{
          borderColor: color.green,
          backgroundColor: color.green,
          width: showPreviousButton ? "48%" : "100%",
        }}
        submit={handleSubmit}
        hideLeft={!showPreviousButton}
        rightLabel={completeButtonText || "DONE"}
      />
    );
  };

  const removePendingEmail = useCallback(
    (email: string, index: number) => {
      const house = selectedHouse;
      if (house?.pendingGuestInvites && house?.pendingGuestInvites.length) {
        const pendingGuestInvites = house.pendingGuestInvites.slice();
        pendingGuestInvites.splice(index, 1);
        if (updateHouse && house.id) {
          updateHouse({
            ...house,
            id: house.id,
            pendingGuestInvites,
          });
        }
      }
    },
    [selectedHouse, updateHouse]
  );

  const renderPendingEmails = () => {
    if (
      selectedHouse?.pendingGuestInvites &&
      (forSettings || showPreviousButton)
    ) {
      return (
        <View>
          {Array.from(new Set(selectedHouse?.pendingGuestInvites)).map(
            (email, index) => {
              return (
                <ActivityItemWithButtons
                  key={email}
                  leftButtonTitle="Remove"
                  leftButtonAction={() => removePendingEmail(email, index)}
                  leftButtonContainerStyle={RED_BUTTON}
                  leftButtonTextStyle={RED_BUTTON_TEXT}
                  container={{
                    marginBottom: normalize(10),
                    backgroundColor: color.white,
                  }}
                  boxedIconName="envelope"
                  boxedIconBackground={color.baby_blue}
                  descriptionHeader={email}
                  description="New Guest Invitation"
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
            }
          )}
        </View>
      );
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <RatsScrollView contentContainerStyle={SCROLL_CONTAINER}>
        <SetupHeader
          header="Guests"
          text="Enter the email addresses of your guests to send them each an invite to join the app."
        >
          {renderPendingEmails()}
          {renderEmailFields()}
          {renderAddButton()}
        </SetupHeader>
      </RatsScrollView>
      {forSettings && renderButtons()}
    </View>
  );
};

interface GuestSetupScreenProps {
  completeButtonText?: string;
  showPreviousButton?: boolean;
  onSubmit?: (
    values: GuestSetupFormValues,
    formikBag: FormikBag<
      ManagerSetupProps & GuestSetupScreenProps,
      GuestSetupFormValues
    >
  ) => void;
}

export interface GuestSetupFormValues {
  guestEmails: string[];
}

const initialValues: GuestSetupFormValues = {
  guestEmails: [],
};

export const GuestSetupForm = withFormik<
  ManagerSetupProps & GuestSetupScreenProps,
  GuestSetupFormValues
>({
  mapPropsToValues: (props) => initialValues,
  handleSubmit: (values, formikBag) => {
    const { selectedHouse, onSubmit, updateHouse, onNextPress } =
      formikBag.props;
    if (onSubmit) {
      onSubmit(values, formikBag);
      return;
    } else {
      if (selectedHouse) {
        const houseWithGuestEmails = extractGuestEmails(
          selectedHouse,
          values.guestEmails
        );
        updateHouse?.(houseWithGuestEmails);
        onNextPress?.();
      }
    }
  },
  validate: (values, props) => {
    const { guestEmails } = values;
    const errors: Record<string, string> = {};
    each(guestEmails, (email, key) => {
      if (email && email.length && !validateEmail(email)) {
        if (email !== "deleted") {
          errors[`guestEmails.${key}`] = "Must be a valid email";
        }
      }
    });
    return errors;
  },
  //@ts-ignore
})(GuestSetupFormView);

export const GuestSetup: React.FC<
  ManagerSetupWithForm & GuestSetupScreenProps
> = (props) => {
  const setupWizard = useHouseSetupWizard();
  return (
    <GuestSetupForm
      {...props}
      selectedHouse={
        props.selectedHouse || setupWizard.selectedHouse || undefined
      }
      updateHouse={props.updateHouse ?? setupWizard.updateHouse}
      showPreviousButton={
        props.showPreviousButton !== null &&
        props.showPreviousButton !== undefined
          ? props.showPreviousButton
          : true
      }
    />
  );
};

export default GuestSetup;
