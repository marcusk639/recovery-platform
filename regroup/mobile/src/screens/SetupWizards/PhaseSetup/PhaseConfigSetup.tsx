import React, { Fragment } from 'react';
import { withHouseSetupWizard } from '../withHouseSetupWizard';
import ManagerSetupProps from '../ManagerSetupEntity';
// Phase 4.1: Extracted business logic to custom hooks
import { usePhaseSetup } from './hooks/usePhaseSetup';
import { usePhaseConfigView } from './hooks/usePhaseConfigView';
import {
  color,
  fontFamily,
  normalize,
  SCROLL_CONTAINER,
  ROW,
  STAT_BUTTON,
  STAT_BUTTON_TEXT,
  fontSize,
  CARD_STYLE,
  SAVE_BUTTON,
} from '../../../styles/theme';
import { View, Dimensions, ViewStyle } from 'react-native';
import { PhaseConfigType, PhaseConfiguration } from '../../../entities/Phase';
import { House } from '../../../entities/House';
import { RatsText } from '../../../components/rats-text';
import { RatsHR } from '../../../components/rats-horizontal-rule';
import {
  camelCaseToDisplayForm,
  ordinalInWord,
  romanize,
} from '../../../util/display';
import RatsModal from '../../../components/rats-modal';
import PhaseConfigForm from './PhaseConfigForm';
import { FormikProps } from 'formik';
import RatsScrollView from '../../../components/rats-scroll-view';
import HelpIcon from '../../../components/help-icon';
import Section from '../../../components/rats-interactable-section';
import RatsButton from '../../../components/rats-button/rats-button';
import { NEXT_BUTTON, NEXT_BUTTON_TEXT } from '../SetupStyles';
import { sortPhases, filterPhases } from '../../../util/house';
import { SetupHeader, SetupButtons } from '../OperatorSetupWizard';
import { ActivityItemWithButtons } from '../../../components/card-list/card-list';
import ScreenHeader from '../../../components/screen-header';
import routes from '../../../constants/routes';
import {
  withPopover,
  WithPopoverProps,
} from '../../../components/rats-hoc/withPopover';
import { Routes } from '../../../navigation/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

export const WIZARD_BUTTON_CONTAINER: ViewStyle = {
  margin: normalize(10),
  right: 0,
};

type PhaseConfigSetupProps = FormikProps<any> &
  ManagerSetupProps &
  WithPopoverProps & { goBack: () => void };

const PhaseConfigSetupComponent: React.FC<PhaseConfigSetupProps> = props => {
  const {
    selectedHouse,
    guests,
    updateHouse,
    startPhaseSetup,
    showPopover,
    forSettings,
    onPrevPress,
    navigation,
    onNextPress,
    handlePhaseSubmit,
  } = props;

  // Use custom hook for business logic - guard against undefined props
  const phaseSetup = usePhaseSetup({
    selectedHouse: selectedHouse || new House(),
    guests: guests || {},
    updateHouse: (house: Partial<House>) => {
      if (updateHouse && house.id) {
        updateHouse({ id: house.id, ...house });
      }
    },
    startPhaseSetup: (phase: PhaseConfiguration) => {
      startPhaseSetup?.(phase);
    },
    onNextPress: onNextPress || (() => {}),
    setPopover: (visible: boolean, heading: string, content: string) => {
      showPopover(content);
    },
  });

  const {
    showModal,
    phaseConfig,
    errors,
    showModalHandler,
    dismissModal,
    setSelectedPhase,
    createNewPhase,
    removePhase,
    addPhase,
    onNext,
    renderHelp,
  } = phaseSetup;

  const renderPhaseSetupModal = () => {
    return (
      <RatsModal
        modalStyle={{
          padding: 0,
          margin: 0,
          alignItems: undefined,
          justifyContent: undefined,
          height: Dimensions.get('screen').height,
        }}
        fullScreen
        useKeyboardView={false}
        style={{
          flex: 1,
          padding: 0,
          margin: 0,
          backgroundColor: color.light_grey,
        }}
        isVisible={showModal}
        onBackdropPress={dismissModal}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        onSwipeComplete={dismissModal}
        swipeDirection="down"
        {...({} as any)}>
        <PhaseConfigForm
          {...props}
          phase={phaseConfig || new PhaseConfiguration()}
          dismissModal={dismissModal}
          setCustomPhase={() => {}}
        />
      </RatsModal>
    );
  };

  const renderSections = () => {
    const guestIds = guests ? Object.keys(guests) : [];
    const phases = filterPhases(selectedHouse?.phases || {}, guestIds);
    return sortPhases(phases).map((phase, index) => {
      const order = index + 1;
      return (
        <ActivityItemWithButtons
          key={phase.name + index}
          leftButtonAction={setSelectedPhase(phase)}
          rightButtonAction={removePhase(phase)}
          rightDisabled={index <= 0}
          rightButtonLight
          rightButtonTextStyle={{ color: color.red }}
          rightButtonContainerStyle={{ borderColor: color.red }}
          leftButtonTitle="EDIT"
          rightButtonTitle="DELETE"
          boxedIconText={romanize(order)}
          boxedIconBackground={color.dark_baby_blue}
          description={`${camelCaseToDisplayForm(
            ordinalInWord(order) || String(order),
          )} phase`}
          descriptionHeader={phase.name}
        />
      );
    });
  };

  const renderButtons = () => {
    return (
      <View style={{ padding: normalize(20), justifyContent: 'space-between' }}>
        <RatsButton
          title="Add Phase"
          onPress={() => showModalHandler(createNewPhase())}
          light
          style={STAT_BUTTON_TEXT}
          containerStyle={{ marginBottom: normalize(20) }}
        />
        <View
          style={{
            ...ROW,
            justifyContent: 'space-between',
            marginTop: 'auto',
          }}>
          <RatsButton
            title="Change System"
            onPress={props.goBack}
            containerStyle={{ ...STAT_BUTTON, flex: 0.47 }}
            style={STAT_BUTTON_TEXT}
          />
          <RatsButton
            title={forSettings ? 'Save' : 'Next'}
            onPress={onNext}
            containerStyle={{
              ...NEXT_BUTTON,
              flex: 0.47,
              width: '100%',
              marginTop: 0,
              marginBottom: 0,
            }}
            style={NEXT_BUTTON_TEXT}
          />
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <RatsScrollView contentContainerStyle={SCROLL_CONTAINER}>
        {renderPhaseSetupModal()}
        <ScreenHeader
          renderBackButton
          onBackPress={forSettings ? onPrevPress : navigation.pop}
          icon={<HelpIcon helpFn={renderHelp} />}
          header="Customize Phase"
        />
        <View style={CARD_STYLE}>
          {renderSections()}
          <RatsButton
            title="ADD PHASE"
            onPress={() => showModalHandler(createNewPhase())}
            light
            style={STAT_BUTTON_TEXT}
            containerStyle={{ marginVertical: normalize(10) }}
          />
        </View>
      </RatsScrollView>
      {forSettings && (
        <View
          style={[
            CARD_STYLE,
            ROW,
            {
              marginTop: 'auto',
              marginBottom: 0,
              justifyContent: 'space-between',
              paddingBottom: normalize(20),
            },
          ]}>
          <RatsButton
            title="Cancel"
            onPress={onPrevPress}
            light
            containerStyle={{ flex: 0.49 }}
          />
          <RatsButton
            title="Save"
            onPress={handlePhaseSubmit}
            containerStyle={{ ...SAVE_BUTTON, flex: 0.49 }}
          />
        </View>
      )}
    </View>
  );
};

export const PhaseConfigSetup = withPopover(
  withHouseSetupWizard(
    PhaseConfigSetupComponent,
    'phase.config.setup.header',
    'phase.config.setup.content',
    false,
    false,
  ),
);

interface PhaseConfigViewProps extends ManagerSetupProps {
  onPhaseButtonPress: (type: PhaseConfigType) => void;
  onNext: () => void;
}

const PhaseConfigViewComponent: React.FC<PhaseConfigViewProps> = props => {
  const {
    selectedHouse,
    onPhaseButtonPress,
    onPrevPress,
    onNextPress,
    navigation,
  } = props;

  // Use custom hook for business logic - guard against undefined props
  const phaseConfigView = usePhaseConfigView({
    selectedHouse: selectedHouse || new House(),
    onPhaseButtonPress,
    onNextPress: onNextPress || (() => {}),
    navigation,
  });

  const {
    selectedPhase,
    error,
    onSubmit,
    getColor,
    getStyle,
    isSelected,
    selectConfig,
    confirmChange,
  } = phaseConfigView;

  const renderButtons = () => {
    if (error) {
      return (
        <View style={{ backgroundColor: color.white }}>
          <RatsText
            text="Please select a phase system."
            style={{
              color: color.red,
              fontSize: fontSize.medium,
              alignSelf: 'center' as const,
              paddingVertical: normalize(10),
            }}
          />
          <SetupButtons
            leftLabel="BACK"
            submit={onSubmit}
            leftPress={onPrevPress}
            navigation={navigation}
          />
        </View>
      );
    } else {
      return (
        <SetupButtons
          leftLabel="BACK"
          submit={onSubmit}
          leftPress={onPrevPress}
          navigation={navigation}
        />
      );
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <RatsScrollView contentContainerStyle={SCROLL_CONTAINER}>
        <SetupHeader header="phase.config.header" text="phase.config.content">
          <ActivityItemWithButtons
            leftButtonAction={confirmChange('basic')}
            rightButtonAction={selectConfig('basic')}
            leftButtonTitle="CUSTOMIZE"
            rightButtonTitle="SELECT"
            rightDisabled={isSelected('basic')}
            container={getStyle('basic')}
            boxedIconName="first-aid"
            boxedIconBackground={getColor('basic')}
            description="Same rules for all guests"
            descriptionHeader="Basic"
          />
          <ActivityItemWithButtons
            leftButtonAction={confirmChange('moderate')}
            rightButtonAction={selectConfig('moderate')}
            leftButtonTitle="CUSTOMIZE"
            rightButtonTitle="SELECT"
            rightDisabled={isSelected('moderate')}
            container={getStyle('moderate')}
            boxedIconName="hospital"
            boxedIconBackground={getColor('moderate')}
            description="Contract System (On/Off Contract)"
            descriptionHeader="Intermediate"
          />
          <ActivityItemWithButtons
            leftButtonAction={confirmChange('advanced')}
            rightButtonAction={selectConfig('advanced')}
            leftButtonTitle="CUSTOMIZE"
            rightDisabled={isSelected('advanced')}
            rightButtonTitle="SELECT"
            container={getStyle('advanced')}
            boxedIconName="hospital-alt"
            boxedIconBackground={getColor('advanced')}
            description="Three phase progressive system"
            descriptionHeader="Progressive"
          />
          <View
            style={[
              ROW,
              {
                marginVertical: normalize(10),
                justifyContent: 'space-between',
              },
            ]}>
            <RatsHR
              style={{
                width: '40%',
                borderBottomWidth: 2,
                alignSelf: 'center',
              }}
            />
            <RatsText text="OR" style={{ fontSize: fontSize.medium }} />
            <RatsHR
              style={{
                width: '40%',
                borderBottomWidth: 2,
                alignSelf: 'center',
              }}
            />
          </View>
          <ActivityItemWithButtons
            leftButtonAction={confirmChange('custom')}
            leftButtonTitle="CUSTOMIZE"
            container={getStyle('custom')}
            boxedIconName="globe-americas"
            boxedIconBackground={getColor('custom')}
            description="Create your phase system from scratch"
            descriptionHeader="Custom"
          />
        </SetupHeader>
      </RatsScrollView>
      {props.forSettings && renderButtons()}
    </View>
  );
};

export const PhaseConfigView = withHouseSetupWizard(
  PhaseConfigViewComponent,
  'phase.config.header',
  'phase.config.content',
  false,
  false,
);
