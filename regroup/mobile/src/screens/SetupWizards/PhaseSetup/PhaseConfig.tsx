import React, { useCallback } from "react";
import { withHouseSetupWizard } from "../withHouseSetupWizard";
import { useHouseSetupWizard } from "../../../hooks/useHouseSetupWizard";
import { ViewStyle } from "react-native";
import { SETUP_BUTTON_STYLE } from "../SetupStyles";
import ManagerSetupProps from "../ManagerSetupEntity";
import { PhaseConfigType } from "../../../entities/Phase";
import {
  initializeBasicConfig,
  initializeModerateConfig,
  initializeAdvancedConfig,
} from "../../../util/phase";
import { PhaseConfigView } from "./PhaseConfigSetup";
import { House } from "../../../entities/House";

export const BUTTON_STYLE: ViewStyle = {
  ...SETUP_BUTTON_STYLE,
  justifyContent: "space-between",
};

type PhaseConfigProps = ManagerSetupProps;

const PhaseConfigComponent: React.FC<PhaseConfigProps> = (props) => {
  const {
    updateHouse: propsUpdateHouse,
    selectedHouse,
    ...managerProps
  } = props;
  const setupWizard = useHouseSetupWizard();
  const updateHouse = propsUpdateHouse ?? setupWizard.updateHouse;

  const setupPhases = useCallback(
    (configType: PhaseConfigType) => {
      if (!updateHouse || !selectedHouse?.id) return;

      switch (configType) {
        case "basic":
          updateHouse({ id: selectedHouse.id, ...initializeBasicConfig() });
          break;
        case "moderate":
          updateHouse({ id: selectedHouse.id, ...initializeModerateConfig() });
          break;
        case "advanced":
          updateHouse({ id: selectedHouse.id, ...initializeAdvancedConfig() });
          break;
        case "custom":
          updateHouse({
            id: selectedHouse.id,
            phases: { ...new House().phases },
          });
          break;
        default:
      }
    },
    [updateHouse, selectedHouse]
  );

  const onPhaseButtonPress = useCallback(
    (configType: PhaseConfigType) => {
      setupPhases(configType);
    },
    [setupPhases]
  );

  const PhaseConfigViewTyped = PhaseConfigView as any;
  return (
    <PhaseConfigViewTyped
      {...managerProps}
      // Hardened 2026-07-07: selectedHouse is destructured above for local
      // use in setupPhases() but was never forwarded back down. Currently
      // inert — PhaseConfigView has its own separate withHouseSetupWizard
      // wrap that re-injects selectedHouse from Redux after this spread,
      // so it always wins regardless — but that's an implicit,
      // easy-to-break coincidence, not a guarantee. Forward it explicitly
      // so this doesn't silently start dropping selectedHouse if
      // PhaseConfigView's own HOC wrap is ever removed or refactored.
      selectedHouse={selectedHouse}
      onPhaseButtonPress={onPhaseButtonPress}
      onNext={() => {
        // This can be empty or call onNextPress if it exists
        if (managerProps.onNextPress) {
          managerProps.onNextPress();
        }
      }}
      key="0"
    />
  );
};

export const PhaseConfig = withHouseSetupWizard(
  PhaseConfigComponent,
  undefined,
  undefined
);
