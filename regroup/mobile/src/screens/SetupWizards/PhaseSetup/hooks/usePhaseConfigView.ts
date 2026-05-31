/**
 * usePhaseConfigView - Custom hook for phase configuration view logic
 *
 * Phase 4.1: Extracted from PhaseConfigSetup.tsx (PhaseConfigViewComponent)
 * Contains phase selection, validation, and style management
 */
import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { map } from 'lodash';
import { PhaseConfigType } from '../../../../entities/Phase';
import { color, normalize } from '../../../../styles/theme';
import { House } from '../../../../entities/House';
import { Routes, SetupScreenNavigationProp } from '../../../../navigation/types';

const DEFAULT_PHASE = 'Entry';

interface UsePhaseConfigViewProps {
  selectedHouse: House;
  onPhaseButtonPress: (type: PhaseConfigType) => void;
  onNextPress: () => void;
  navigation: SetupScreenNavigationProp;
}

export const usePhaseConfigView = ({
  selectedHouse,
  onPhaseButtonPress,
  onNextPress,
  navigation,
}: UsePhaseConfigViewProps) => {
  // Check current phase configuration
  const checkPhases = useCallback((house: any) => {
    const phaseNames = {
      basicPhases: ['Basic'],
      contractPhases: ['Contract', 'No Contract'],
      progressivePhases: ['Entry', 'Normal', 'Senior'],
    };
    const selectedHousePhases = map(house.phases, phase => phase.name);
    const isSameConfig = (
      name: 'basicPhases' | 'contractPhases' | 'progressivePhases',
    ) => selectedHousePhases.every(phase => phaseNames[name].includes(phase));

    if (isSameConfig('basicPhases')) {
      return 'basic';
    }
    if (isSameConfig('contractPhases')) {
      return 'moderate';
    }
    if (isSameConfig('progressivePhases')) {
      return 'advanced';
    }
    if (!selectedHousePhases.includes(DEFAULT_PHASE)) {
      return 'custom';
    }
    return null;
  }, []);

  // State management
  const [selectedPhase, setSelectedPhase] = useState<PhaseConfigType | null>(
    checkPhases(selectedHouse),
  );
  const [error, setError] = useState(false);

  // Submit handler with validation
  const onSubmit = useCallback(() => {
    if (!selectedPhase) {
      setError(true);
    } else {
      onNextPress();
    }
  }, [selectedPhase, onNextPress]);

  // Style helpers
  const getColor = useCallback(
    (config: PhaseConfigType) => {
      return selectedPhase === config
        ? color.light_green
        : color.dark_baby_blue;
    },
    [selectedPhase],
  );

  const getStyle = useCallback(
    (config: PhaseConfigType) => {
      return selectedPhase === config
        ? { borderColor: color.light_green, borderWidth: normalize(3) }
        : {};
    },
    [selectedPhase],
  );

  const isSelected = useCallback(
    (config: PhaseConfigType) => {
      return selectedPhase === config;
    },
    [selectedPhase],
  );

  // Phase selection with confirmation
  const selectConfig = useCallback(
    (config: PhaseConfigType) => () => {
      if (selectedPhase && config !== selectedPhase) {
        return Alert.alert(
          'Confirm Selection',
          'Selecting or customizing this configuration will overwrite any phase customizations you have made. Are you sure you want to continue?',
          [
            { text: 'Cancel', onPress: () => null },
            {
              text: 'Continue',
              onPress: () => {
                setSelectedPhase(config);
                setError(false);
                onPhaseButtonPress(config);
              },
            },
          ],
        );
      }
      setSelectedPhase(config);
      setError(false);
      onPhaseButtonPress(config);
    },
    [selectedPhase, onPhaseButtonPress],
  );

  // Navigate to customize phase
  const customize = useCallback(
    (config: PhaseConfigType) => {
      if (config !== selectedPhase) {
        setSelectedPhase(config);
        setError(false);
        onPhaseButtonPress(config);
      }
      navigation.navigate(Routes.PhaseSetup);
    },
    [selectedPhase, onPhaseButtonPress, navigation],
  );

  // Confirm before customizing
  const confirmChange = useCallback(
    (config: PhaseConfigType) => () => {
      if (selectedPhase && config !== selectedPhase) {
        return Alert.alert(
          'Confirm Selection',
          'Selecting or customizing this configuration will overwrite any phase customizations you have made. Are you sure you want to continue?',
          [
            { text: 'Cancel', onPress: () => null },
            { text: 'Continue', onPress: () => customize(config) },
          ],
        );
      }
      customize(config);
    },
    [selectedPhase, customize],
  );

  return {
    // State
    selectedPhase,
    error,

    // Actions
    onSubmit,
    getColor,
    getStyle,
    isSelected,
    selectConfig,
    confirmChange,
  };
};
