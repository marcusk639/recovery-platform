import React, { useCallback, useMemo, useState } from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ManagerSetup from './ManagerSetup';
import ChoreSetup from './ChoreSetup';
import HouseSetup from './HouseSetup';
import { PhaseConfig } from './PhaseSetup/PhaseConfig';
import GuestSetup from './GuestSetup';
import { Routes, SetupScreenNavigationProp } from '../../navigation/types';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import RatsWizardProgress from '../../components/rats-wizard-progress';
import RatsWizardSlide from '../../components/rats-wizard-slide';
import SharedSetupButtons from '../../components/setup-buttons';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import {
  ROW,
  CARD_STYLE,
  HEADER,
  normalize,
  fontSize,
  color,
} from '../../styles/theme';

/**
 * Legacy inline SetupButtons. Retained for step components when rendered in
 * settings-edit mode (`forSettings === true`). New code should import the
 * shared component at `src/components/setup-buttons` instead.
 *
 * @deprecated Use `import SetupButtons from '../../components/setup-buttons'`
 *   for new code. This export will be removed once all step components fully
 *   migrate away from settings-mode inline button rows.
 */
export const SetupButtons = (props: {
  leftPress?: () => any;
  hideLeft?: boolean;
  submit: () => any;
  leftLabel?: string;
  rightLabel?: string;
  container?: ViewStyle;
  rightDisabled?: boolean;
  rightButtonContainer?: ViewStyle;
  navigation: SetupScreenNavigationProp;
}) => {
  const CONTAINER = props.container || {};
  const { rightButtonContainer = {}, rightDisabled } = props;
  return (
    <SafeAreaView
      edges={[]}
      style={[
        ROW,
        CARD_STYLE,
        {
          justifyContent: 'space-between',
          marginTop: 'auto',
          paddingBottom: normalize(20),
          ...CONTAINER,
        },
      ]}>
      {!props.hideLeft && (
        <RatsButton
          testID="previous-step-button"
          title={props.leftLabel || 'CANCEL'}
          containerStyle={{ width: '49%' }}
          onPress={props.leftPress ? props.leftPress : props.navigation.goBack}
          light
        />
      )}
      <RatsButton
        testID="next-step-button"
        title={props.rightLabel || 'NEXT'}
        containerStyle={{ width: '49%', ...rightButtonContainer }}
        onPress={props.submit}
        disabled={rightDisabled}
      />
    </SafeAreaView>
  );
};

/**
 * Legacy inline SetupHeader. Retained for step components when rendered in
 * settings-edit mode. New code should import `src/components/setup-header`
 * for the richer BoxedIcon-based header card.
 *
 * @deprecated Use `import SetupHeader from '../../components/setup-header'`
 *   for new code. This export remains for backwards-compatibility with
 *   step components in settings-edit mode.
 */
export const SetupHeader = (props: any) => {
  return (
    <View
      style={[
        {
          backgroundColor: color.white,
          ...CARD_STYLE,
          marginBottom: 0,
          paddingHorizontal: normalize(15),
          paddingBottom: normalize(20),
        },
        props.container,
      ]}>
      <RatsText text={props.header} style={{ ...HEADER, marginLeft: 0 }} />
      {props.text && (
        <RatsText
          style={{
            color: color.dark_grey,
            fontSize: fontSize.medium,
            marginBottom: normalize(10),
          }}
          text={props.text}
        />
      )}
      {props.children}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// OperatorSetupWizard — the Traditional house setup wizard.
// Uses the shared wizard primitives from src/components/. Step components
// no longer render their own button row in wizard mode (forSettings is false
// or undefined). The parent's SetupButtons row handles all wizard navigation.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  navigation: SetupScreenNavigationProp;
}

const STEP_LABELS = [
  'Details',
  'Managers',
  'Phases',
  'Chores',
  'Guests',
] as const;
const TOTAL_STEPS = STEP_LABELS.length;

const OperatorSetupWizard: React.FC<Props> = props => {
  const [currentPage, setCurrentPage] = useState(0);
  const keyboardVisible = useKeyboardVisible();
  const navigation = props.navigation;

  const finishHouseSetup = useCallback(() => {
    navigation.navigate(Routes.OrgSetup);
  }, [navigation]);

  const goBack = useCallback(() => {
    if (currentPage === 0) navigation.goBack();
    else setCurrentPage(p => p - 1);
  }, [currentPage, navigation]);

  const goNext = useCallback(() => {
    if (currentPage === TOTAL_STEPS - 1) {
      finishHouseSetup();
    } else {
      setCurrentPage(p => Math.min(p + 1, TOTAL_STEPS - 1));
    }
  }, [currentPage, finishHouseSetup]);

  const pages = useMemo(
    () => [
      <HouseSetup
        {...props}
        focused={currentPage === 0}
        onNextPress={goNext}
        key="0"
      />,
      <ManagerSetup
        {...props}
        focused={currentPage === 1}
        onPrevPress={goBack}
        onNextPress={goNext}
        key="1"
      />,
      <PhaseConfig
        {...props}
        focused={currentPage === 2}
        onPrevPress={goBack}
        onNextPress={goNext}
        key="2"
      />,
      <ChoreSetup
        {...props}
        focused={currentPage === 3}
        onPrevPress={goBack}
        onNextPress={goNext}
        key="3"
      />,
      <GuestSetup
        {...props}
        focused={currentPage === 4}
        onPrevPress={goBack}
        onNextPress={goNext}
        key="4"
      />,
    ],
    [currentPage, goBack, goNext, props],
  );

  return (
    <SafeAreaView
      edges={['top']}
      style={styles.container}
      testID="house-setup-wizard">
      {!keyboardVisible && (
        <RatsWizardProgress
          stepCount={TOTAL_STEPS}
          currentStep={currentPage}
          currentLabel={STEP_LABELS[currentPage]}
          testID="operator-wizard-progress"
        />
      )}
      <RatsWizardSlide currentStep={currentPage} testID="operator-wizard-slide">
        {pages}
      </RatsWizardSlide>
      <View
        testID={
          currentPage === TOTAL_STEPS - 1
            ? 'wizard-finish-button'
            : 'wizard-next-button'
        }>
        <View testID="wizard-back-button">
          <SharedSetupButtons
            onBackPress={goBack}
            onNextPress={goNext}
            hideBack={currentPage === 0}
            nextLabel={currentPage === TOTAL_STEPS - 1 ? 'Finish' : 'Next'}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.light_grey,
  },
});

export default OperatorSetupWizard;
