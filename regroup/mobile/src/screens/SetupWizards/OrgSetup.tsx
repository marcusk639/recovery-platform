import React, { useState, useCallback, useEffect } from "react";
import { View, ViewStyle } from "react-native";
// Phase 3.3: Migrated from withLoadingModal to useModal hook
import { useModal } from "../../context";
import { useHouseSetupWizard } from "../../hooks/useHouseSetupWizard";
import { withFormik } from "formik";
import ManagerSetupProps, { ManagerSetupWithForm } from "./ManagerSetupEntity";
import { useNotification } from "../../context";
import {
  normalize,
  color,
  SCROLL_CONTAINER,
  STAT_BUTTON_TEXT,
  CARD_STYLE,
  HEADER,
  fontSize,
  CARD_NO_ELEVATION,
} from "../../styles/theme";
import { House } from "../../entities/House";
import { createHouseId } from "../../services/house";
import { Routes } from "../../navigation/types";
import { navigateToMainTab } from "../../navigation/authNavigation";
import { NEXT_BUTTON_TEXT, NEXT_BUTTON } from "./SetupStyles";
import { each, isEmpty, map } from "lodash";
import RatsScrollView from "../../components/rats-scroll-view";
import RatsButton from "../../components/rats-button/rats-button";
import ScreenHeader from "../../components/screen-header";
import SetupHeader from "../../components/setup-header";
import HelpIcon from "../../components/help-icon";
import {
  ActivityItem,
  ActivityItemWithButtons,
} from "../../components/card-list/card-list";
import Admin from "../../entities/Admin";
import { getAddressDisplay } from "../../util/address";
import Section from "../../components/rats-interactable-section";

import { RatsText } from "../../components/rats-text";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

export const WIZARD_BUTTON_CONTAINER: ViewStyle = {
  margin: normalize(10),
  position: "absolute",
  bottom: 0,
  right: 0,
};

export const SETUP_HEADER: ViewStyle = {
  ...CARD_STYLE,
  paddingHorizontal: normalize(15),
  paddingBottom: normalize(20),
};

type OrgSetupFormViewProps = ManagerSetupWithForm;

const OrgSetupFormView: React.FC<OrgSetupFormViewProps> = (props) => {
  const { navigation, handleSubmit } = props;

  // Hardened 2026-07-05: withHouseSetupWizard was imported but never actually
  // applied to this component, and no parent ever passed houses/submitting/
  // startHouseSetup/removeHouse/setupHouse as props either. Every read here
  // was `undefined` (house list always empty, loading modal never showed)
  // and every write was a no-op (EDIT/DELETE/ADD HOUSE did nothing). Reading
  // and dispatching through the hook directly fixes both sides.
  const setupWizard = useHouseSetupWizard();
  const {
    houses,
    submitting,
    submittingSuccessful,
    submittingFailed,
    startHouseSetup,
    removeHouse,
    setupHouse,
  } = setupWizard;

  // Phase 3.3: Use hooks instead of HOCs
  const { showLoadingModal, hideLoadingModal, setLoadingModalState } =
    useModal();
  const { notify, showPopover } = useNotification();

  const [collapsedHouses, setCollapsedHouses] = useState<{
    [houseId: string]: boolean;
  }>({});
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [errors, setErrors] = useState<{ [houseId: string]: string }>({});

  useEffect(() => {
    const loadingMessage = "Processing...";
    const errorMessage = submittingFailed
      ? "House submission failed"
      : undefined;
    setLoadingModalState(
      submitting || false,
      submittingSuccessful || false,
      loadingMessage,
      errorMessage
    );
  }, [
    submitting,
    submittingSuccessful,
    submittingFailed,
    setLoadingModalState,
  ]);

  const onCloseMenu = useCallback(() => {
    setSelectedHouse(null);
  }, []);

  const showHouseMenu = useCallback(
    (house: House) => () => {
      setSelectedHouse(house);
    },
    []
  );

  const editHouse = useCallback(
    (house: House) => () => {
      startHouseSetup?.(house);
      navigation.navigate(Routes.OperatorSetupWizard);
    },
    [startHouseSetup, navigation]
  );

  const deleteHouse = useCallback(
    (house: House) => () => {
      removeHouse?.(house.id);
    },
    [removeHouse]
  );

  const addHouse = useCallback(() => {
    const house = new House();
    house.id = createHouseId();
    setupHouse?.(house);
    navigation.navigate(Routes.OperatorSetupWizard);
  }, [setupHouse, navigation]);

  const validateHouses = useCallback(() => {
    const newErrors: Record<string, string> = {};
    let valid = true;
    each(houses, (house) => {
      const location =
        house.name && house.street && house.city && house.state && house.zip;
      const number = house.phoneNumber;
      const gender = house.gender;
      if (!location || !number || !gender) {
        valid = false;
        newErrors[house.id] = "This house is missing some information";
      }
    });
    setErrors(newErrors);
    return valid;
  }, [houses]);

  const submit = useCallback(() => {
    if (validateHouses()) {
      handleSubmit();
    }
  }, [validateHouses, handleSubmit]);

  const renderHelp = useCallback(() => {
    showPopover(
      "ORG SETUP",
      "Here you can set up your organization. You can add houses, managers, and other information."
    );
  }, [showPopover]);

  const renderHouses = () => {
    return map(houses, (house) =>
      house ? (
        <View key={house.id} testID={`house-item-${house.id}`}>
          <ActivityItemWithButtons
            rightButtonContainerStyle={{ borderColor: color.red }}
            rightButtonTextStyle={{ color: color.red }}
            rightButtonLight
            leftButtonAction={editHouse(house)}
            rightButtonAction={deleteHouse(house)}
            leftButtonTitle="EDIT"
            leftButtonTestID={`edit-house-button-${house.id}`}
            rightButtonTestID={`delete-house-button-${house.id}`}
            rightButtonTitle="DELETE"
            container={{
              marginTop: normalize(20),
              borderColor: errors[house.id] ? color.red : color.dark_grey,
              backgroundColor: errors[house.id] ? color.light_red : color.white,
            }}
            boxedIconName="home"
            boxedIconBackground={color.dark_blue}
            description={getAddressDisplay(
              house.street,
              undefined,
              undefined,
              undefined
            )}
            descriptionHeader={house.name}
            error={errors[house.id]}
          />
        </View>
      ) : null
    );
  };

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={{ flex: 1, backgroundColor: color.white }}
      testID="org-setup-screen"
    >
      <View style={{ flex: 1, backgroundColor: color.light_grey }}>
        <ScreenHeader
          renderBackButton
          icon={<HelpIcon helpFn={renderHelp} />}
          header={"org.setup.header"}
        />
        <View style={{ flex: 1, justifyContent: "space-between" }}>
          <View style={[SETUP_HEADER]}>
            <RatsText text="House setup" style={{ ...HEADER, marginLeft: 0 }} />
            <RatsText
              style={{
                color: color.dark_grey,
                fontSize: fontSize.medium,
                marginBottom: normalize(10),
              }}
              text="Set up the houses in your organization here. Any houses added will be added to this organization."
            />
            {renderHouses()}
            <RatsButton
              testID="add-house-button"
              onPress={addHouse}
              containerStyle={{ marginTop: normalize(15) }}
              light
              title="ADD HOUSE"
            />
          </View>
          {/* <SetupHeader icon="users-cog" iconBackgroundColor={color.light_purple} header={'org.setup.header'} description={'org.setup.content'} /> */}
          <View style={[CARD_STYLE, { marginBottom: 0 }]}>
            <RatsButton
              testID="complete-setup-button"
              disabled={isEmpty(houses)}
              title="COMPLETE SETUP"
              onPress={submit}
              light
              style={NEXT_BUTTON_TEXT}
              containerStyle={NEXT_BUTTON}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const initialValues = { firstName: "", lastName: "" };

const OrgSetupForm = withFormik<ManagerSetupProps, Partial<Admin>>({
  mapPropsToValues: (props) => initialValues,
  handleSubmit: async (values, formikBag) => {
    try {
      if (formikBag.props.submitHouse) {
        await formikBag.props.submitHouse();
      }
      // Hardened 2026-07-07: clear the wizard's staged Redux state now that
      // it's been persisted, so a future re-entry into this wizard (e.g. via
      // HouseSettings/ManagerSettings -> OperatorSetupWizard) doesn't start
      // from a stale prior session's selectedHouse/houses.
      formikBag.props.resetSetup?.();
      if (formikBag.props.navigation) {
        navigateToMainTab(formikBag.props.navigation, Routes.House);
      }
    } catch (error) {
      // submitHouse's rejection already updates Redux (submittingFailed +
      // error), which OrgSetupFormView's loading-modal effect surfaces to
      // the operator. Deliberately do not navigate away here — the operator
      // would otherwise lose their house list with no indication anything
      // went wrong.
    }
  },
  validationSchema: null,
  //@ts-ignore
})(OrgSetupFormView);

const OrgSetup: React.FC<ManagerSetupWithForm> = (props) => {
  const setupWizard = useHouseSetupWizard();
  return (
    <RatsScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={SCROLL_CONTAINER}
    >
      <OrgSetupForm
        {...props}
        submitHouse={setupWizard.submitHouse}
        resetSetup={setupWizard.resetSetup}
      />
    </RatsScrollView>
  );
};

export default OrgSetup;
