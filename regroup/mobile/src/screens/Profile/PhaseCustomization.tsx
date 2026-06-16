// Phase 3.3: Migrated from withPopover HOC to useNotification hook
import React, { useState, useCallback } from 'react';
import { useNotification } from '../../context';
import { each, map } from 'lodash';
import {
  color,
  normalize,
  SCROLL_CONTAINER,
  ROW,
  CARD_STYLE,
  SAVE_BUTTON,
  fontSize,
} from '../../styles/theme';
import { View, Dimensions, ViewStyle, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PhaseConfiguration } from '../../entities/Phase';
import { PhaseConfigForm } from '../SetupWizards/PhaseSetup/PhaseConfigForm';
import RatsModal from '../../components/rats-modal';
import { sortPhases } from '../../util/house';
import { ActivityItemWithButtons } from '../../components/card-list/card-list';
import {
  romanize,
  camelCaseToDisplayForm,
  ordinalInWord,
  formatName,
} from '../../util/display';
import RatsButton from '../../components/rats-button/rats-button';
import { NEXT_BUTTON, NEXT_BUTTON_TEXT } from '../SetupWizards/SetupStyles';
import { validatePhases } from '../../util/phase';
import RatsScrollView from '../../components/rats-scroll-view';
import { Guest } from '../../entities/Guest';
import { House } from '../../entities/House';
import { Guests } from '../../types';
import ScreenHeader from '../../components/screen-header';
import HelpIcon from '../../components/help-icon';
import { RatsHR } from '../../components/rats-horizontal-rule';
import { RatsText } from '../../components/rats-text';

import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useGuests, useUpdateGuest } from '../../state/queries/guestQueries';
import { logException } from '../../util/logging';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';

export const WIZARD_BUTTON_CONTAINER: ViewStyle = {
  margin: normalize(10),
  right: 0,
};

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * Phase Customization Screen
 *
 * Allows customization of phase rules for individual guests.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (guestActions, action types)
 * - Added RTK import: customizeGuestPhase from guestsSlice
 * - Fixed import path: ../../state/hooks → ../../state/store
 * - Updated 3 selectors to use RTK state (removed 'as any' casts)
 * - Replaced 1 dispatch call with RTK thunk (.unwrap() for error handling)
 * - HOCs kept for Phase 3 removal
 */
const PhaseCustomization: React.FC<Props> = ({ navigation }) => {
  // Context hook
  const { showPopover, setPopoverRef } = useNotification();

  const { mutateAsync: updateGuestAsync } = useUpdateGuest();
  const { house: selectedHouse } = useSelectedHouse();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(selectedHouse?.id ?? '');
  const { guest } = useSelectedGuest();

  const [showModal, setShowModal] = useState(false);
  const [phaseConfig, setPhaseConfig] = useState<PhaseConfiguration>(
    (guest?.phase && selectedHouse?.phases[guest.phase]) ||
      new PhaseConfiguration(),
  );
  const [customPhase, setCustomPhaseState] = useState<PhaseConfiguration>(
    (guest?.phase && selectedHouse?.phases[guest.phase]) ||
      new PhaseConfiguration(),
  );
  const [errors, setErrors] = useState<{ [phaseName: string]: string }>({});

  const showModalCallback = useCallback((phase: PhaseConfiguration) => {
    setShowModal(true);
    setPhaseConfig(phase);
  }, []);

  const dismissModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const setCustomPhase = useCallback((phase: PhaseConfiguration) => {
    setCustomPhaseState(phase);
    setPhaseConfig(phase);
  }, []);

  const renderPhaseSetupModal = useCallback(() => {
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
        animationIn="slideInRight"
        animationOut="slideOutRight"
        onSwipeComplete={dismissModal}
        swipeDirection="right"
        {...({} as any)}>
        <PhaseConfigForm
          {...({
            selectedHouse: selectedHouse || undefined,
            setCustomPhase: setCustomPhase,
            phase: customPhase,
            customize: true,
            dismissModal: dismissModal,
          } as any)}
        />
      </RatsModal>
    );
  }, [
    showModal,
    dismissModal,
    selectedHouse,
    customPhase,
    setCustomPhase,
    setPopoverRef,
  ]);

  const assignPhaseToGuest = useCallback(
    (phase: PhaseConfiguration) => () => {
      setPhaseConfig(phase);
      setCustomPhaseState(phase);
    },
    [],
  );

  const renderSections = useCallback(() => {
    const phases: Record<string, any> = {};
    const guestIds = map(guests, g => g.id);
    each(selectedHouse?.phases, phase => {
      if (!guestIds.includes(phase.name)) {
        phases[phase.name] = phase;
      }
    });
    return sortPhases(phases).map((phase, index) => {
      const order = index + 1;
      const selected = phaseConfig && phaseConfig.name === phase.name;
      return (
        <ActivityItemWithButtons
          key={phase.name + index}
          leftButtonAction={assignPhaseToGuest(phase)}
          leftButtonTitle="Select"
          leftButtonLight={false}
          boxedIconText={romanize(order)}
          boxedIconBackground={color.dark_baby_blue}
          description={`${camelCaseToDisplayForm(
            ordinalInWord(order) ?? '',
          )} phase`}
          descriptionHeader={phase.name}
          container={
            selected ? { borderWidth: 2, borderColor: color.green } : undefined
          }
        />
      );
    });
  }, [guests, selectedHouse, phaseConfig, assignPhaseToGuest]);

  const customizePhaseHandler = useCallback(() => {
    const phase =
      customPhase ||
      (guest?.id && selectedHouse?.phases[guest.id]) ||
      (guest?.phase && selectedHouse?.phases[guest.phase]) ||
      new PhaseConfiguration();
    const newCustomPhase: PhaseConfiguration = {
      ...phase,
      name: guest?.id || '',
    };
    setCustomPhaseState(newCustomPhase);
    setPhaseConfig(newCustomPhase);
    setShowModal(true);
  }, [customPhase, selectedHouse, guest]);

  const renderCustomizationSection = useCallback(() => {
    const selected = phaseConfig.name === guest?.id;
    return (
      <ActivityItemWithButtons
        key="Customize"
        leftButtonAction={customizePhaseHandler}
        leftButtonTitle="Customize"
        leftButtonLight={false}
        boxedIconName="clipboard"
        boxedIconBackground={color.light_purple}
        description={`Customize rules for ${formatName(
          guest?.firstName || '',
          guest?.lastName || '',
        )}`}
        descriptionHeader="Custom"
        container={
          selected ? { borderWidth: 2, borderColor: color.green } : undefined
        }
      />
    );
  }, [phaseConfig, guest, customizePhaseHandler]);

  const renderButtons = useCallback(() => {
    return (
      <View style={{ padding: normalize(20), justifyContent: 'space-between' }}>
        <View
          style={{
            ...ROW,
            justifyContent: 'space-between',
            marginTop: 'auto',
          }}>
          <RatsButton
            title="Save"
            onPress={save}
            containerStyle={{
              ...NEXT_BUTTON,
              flex: 1,
              width: '100%',
              marginTop: 0,
              marginBottom: 0,
            }}
            style={NEXT_BUTTON_TEXT}
          />
        </View>
      </View>
    );
  }, []);

  const save = useCallback(async () => {
    if (!guest) return;
    try {
      // Persist only the phase pointer through the safe transactional merge
      // (useUpdateGuest → updateGuest) so no other guest field is clobbered.
      await updateGuestAsync({
        guest,
        updatedGuest: { id: guest.id, phase: customPhase.name } as Guest,
      });
    } catch (error) {
      logException(error);
    }
    navigation.goBack();
  }, [customPhase, guest, updateGuestAsync, navigation]);

  const help = useCallback(() => {
    showPopover(
      'Select Phase',
      'Select a phase for this guest or customize a phase specifically for this guest.',
    );
  }, [showPopover]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <RatsScrollView
        style={{ backgroundColor: color.light_grey }}
        contentContainerStyle={SCROLL_CONTAINER}>
        {renderPhaseSetupModal()}
        <ScreenHeader
          renderBackButton
          onBackPress={() => navigation.goBack()}
          icon={<HelpIcon helpFn={help} />}
          header={
            formatName(guest?.firstName || '', guest?.lastName || '') +
            "'s Phase"
          }
        />
        <View style={CARD_STYLE}>
          {renderSections()}
          <View
            style={[
              ROW,
              {
                justifyContent: 'space-between',
                paddingVertical: normalize(30),
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
          {renderCustomizationSection()}
        </View>
      </RatsScrollView>
      <View
        style={[
          CARD_STYLE,
          ROW,
          {
            marginTop: 'auto',
            marginBottom: 0,
            justifyContent: 'space-between',
          },
        ]}>
        <RatsButton
          title="Cancel"
          onPress={() => navigation.goBack()}
          light
          containerStyle={{ flex: 0.49 }}
        />
        <RatsButton
          title="Save"
          onPress={save}
          containerStyle={{ ...SAVE_BUTTON, flex: 0.49 }}
        />
      </View>
    </SafeAreaView>
  );
};

export default PhaseCustomization;
