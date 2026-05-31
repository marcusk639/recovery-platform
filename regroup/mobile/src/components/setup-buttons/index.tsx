import React from 'react';
import { View, ViewStyle, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RatsButton from '../rats-button/rats-button';
import { ROW, CARD_STYLE, normalize, color } from '../../styles/theme';

export interface SetupButtonsProps {
  onBackPress: () => void;
  onNextPress: () => void;
  /** Default: "Back" */
  backLabel?: string;
  /** Default: "Next" */
  nextLabel?: string;
  /** When true, the Next button is disabled (greyed out, no press handler). */
  nextDisabled?: boolean;
  /** When true, the Back button is not rendered (useful for step 0). */
  hideBack?: boolean;
  /** When true, renders ActivityIndicator in place of Next. */
  isLoading?: boolean;
  container?: ViewStyle;
}

/**
 * Paired Back/Next button row anchored to the bottom of a wizard step.
 * Wraps in SafeAreaView so the home-indicator on iPhone X+ doesn't overlap.
 *
 * @example
 * <SetupButtons
 *   onBackPress={() => setStep(s => s - 1)}
 *   onNextPress={() => setStep(s => s + 1)}
 *   nextDisabled={!isValid}
 *   hideBack={step === 0}
 * />
 */
const SetupButtons: React.FC<SetupButtonsProps> = ({
  onBackPress,
  onNextPress,
  backLabel = 'Back',
  nextLabel = 'Next',
  nextDisabled = false,
  hideBack = false,
  isLoading = false,
  container,
}) => {
  return (
    <SafeAreaView
      edges={['bottom']}
      style={[
        ROW,
        CARD_STYLE,
        {
          justifyContent: 'space-between',
          marginTop: 'auto',
          paddingBottom: normalize(20),
          ...container,
        },
      ]}>
      {!hideBack && (
        <RatsButton
          testID="setup-buttons-back"
          title={backLabel}
          containerStyle={{ width: '49%' }}
          onPress={onBackPress}
          light
        />
      )}
      {isLoading ? (
        <View
          style={{ width: hideBack ? '100%' : '49%', alignItems: 'center' }}>
          <ActivityIndicator color={color.main} />
        </View>
      ) : (
        <RatsButton
          testID="setup-buttons-next"
          title={nextLabel}
          containerStyle={{ width: hideBack ? '100%' : '49%' }}
          onPress={onNextPress}
          disabled={nextDisabled}
        />
      )}
    </SafeAreaView>
  );
};

export default SetupButtons;
