import React, { useState, useCallback } from 'react';
import { withFormik, FormikProps } from 'formik';
import ManagerSetupProps, { ManagerSetupWithForm } from './ManagerSetupEntity';
import { View, ViewStyle } from 'react-native';
import {
  normalize,
  color,
  SCROLL_CONTAINER,
  STAT_BUTTON_TEXT,
  MODAL_CONTAINER_STYLE,
  MODAL_STYLE,
  CARD_STYLE,
  SAVE_BUTTON,
} from '../../styles/theme';
import { House } from '../../entities/House';
import { cloneDeep, forEach, isEmpty, map } from 'lodash';
import { Chore, Chores } from '../../entities/Chore';
import RatsScrollView from '../../components/rats-scroll-view';
import RatsModal from '../../components/rats-modal';
import { renderField } from '../../util/form';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import RatsButton from '../../components/rats-button/rats-button';
import { SetupHeader, SetupButtons } from './OperatorSetupWizard';
import { ActivityItemWithButtons } from '../../components/card-list/card-list';
import ScreenHeader from '../../components/screen-header';
import { useAppSelector, useAppDispatch } from '../../state/store';

export const WIZARD_BUTTON_CONTAINER: ViewStyle = {
  margin: normalize(10),
  position: 'absolute',
  bottom: 0,
  right: 0,
};

type ChoreSetupFormViewProps = FormikProps<Chores> &
  ManagerSetupWithForm &
  ChoreState;

const ChoreSetupFormView: React.FC<ChoreSetupFormViewProps> = props => {
  const {
    values,
    handleSubmit: formikHandleSubmit,
    selectedHouse,
    updateHouse,
    onPrevPress,
    onNextPress,
    forSettings,
    setChores,
    handleChoreSubmit,
  } = props;

  const [selectedChore, setSelectedChore] = useState<Chore | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState<'add' | 'edit'>('add');
  const [collapsedChores, setCollapsedChores] = useState<{
    [choreName: string]: boolean;
  }>({});

  const showModalHandler = useCallback(
    (chore: Chore, mode: 'add' | 'edit') => () => {
      setShowModal(true);
      setMode(mode);
      setSelectedChore(chore);
    },
    [],
  );

  const dismissModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const updateChore = useCallback(
    async (type: 'add' | 'edit', choreBeforeEdit: Chore, newChore: Chore) => {
      dismissModal();
      if (setChores) {
        setChores(choreBeforeEdit, newChore, () => {
          formikHandleSubmit();
        });
      }
    },
    [dismissModal, setChores, formikHandleSubmit],
  );

  const removeChore = useCallback(
    (chore: Chore) => () => {
      if (!selectedHouse?.id || !updateHouse) return;
      const valuesWithoutChore = cloneDeep(values);
      delete valuesWithoutChore[chore.name];
      if (valuesWithoutChore.None) {
        delete valuesWithoutChore.None;
      }
      updateHouse({
        id: selectedHouse.id,
        chores: valuesWithoutChore,
      });
    },
    [values, selectedHouse, updateHouse],
  );

  const addChore = useCallback(() => {
    const newChore = new Chore();
    // Ensure the chore has a valid name before adding it
    if (
      newChore.name &&
      newChore.name.trim() !== '' &&
      selectedHouse &&
      updateHouse
    ) {
      const houseWithNewChore = {
        ...selectedHouse,
        chores: { ...selectedHouse.chores, [newChore.name]: newChore },
      } as House;
      updateHouse(houseWithNewChore);
    }
  }, [selectedHouse, updateHouse]);

  const settingsSubmit = useCallback(() => {
    if (!selectedHouse || !handleChoreSubmit) return;
    const updatedChores: Record<string, any> = {};
    forEach(values, (chore, key) => {
      if (key !== 'None' && chore && chore.name && chore.name.trim() !== '') {
        updatedChores[chore.name] = chore;
      }
    });
    handleChoreSubmit({ ...selectedHouse, chores: updatedChores } as House);
  }, [values, selectedHouse, handleChoreSubmit]);

  const handleSubmitClick = useCallback(() => {
    formikHandleSubmit();
    if (!forSettings && onNextPress) {
      onNextPress();
    }
  }, [formikHandleSubmit, forSettings, onNextPress]);

  const renderModal = () => {
    const chore = selectedChore;
    if (chore && chore.name) {
      const choreBeforeEdit = cloneDeep(chore);
      return (
        <RatsModal
          {...({
            modalStyle: { ...MODAL_STYLE },
            animationIn: 'slideInUp',
            isVisible: showModal,
            style: MODAL_CONTAINER_STYLE,
            onBackdropPress: dismissModal,
          } as any)}>
          <View style={{ flex: 1 }}>
            <ScreenHeader
              renderBackButton
              header={`${mode === 'add' ? 'Add' : 'Edit'} Chore`}
              onBackPress={() => setShowModal(false)}
            />
            <View style={CARD_STYLE}>
              {renderField(
                `${chore.name}.name`,
                'Chore Name',
                RatsTextInput,
                false,
                'Chore Name',
                'string',
                color.black,
              )}
              {renderField(
                `${chore.name}.description`,
                'Chore Description',
                RatsTextInput,
                false,
                'Chore Description',
                'string',
                color.black,
                undefined,
                undefined,
                undefined,
                undefined,
                7,
              )}
            </View>
            <SetupButtons
              container={{ paddingBottom: normalize(20) }}
              rightLabel="APPLY"
              submit={() =>
                updateChore(mode, choreBeforeEdit, values[chore.name])
              }
              leftPress={() => setShowModal(false)}
              navigation={props.navigation}
            />
          </View>
        </RatsModal>
      );
    }
  };

  const renderChores = () => {
    const { chores } = selectedHouse || {};
    return map(chores, chore => (
      <ActivityItemWithButtons
        key={chore.name}
        leftButtonAction={showModalHandler(chore, 'edit')}
        rightButtonAction={removeChore(chore)}
        leftButtonTitle="EDIT"
        rightButtonTitle="DELETE"
        boxedIconName="broom"
        boxedIconBackground={color.dark_baby_blue}
        description={chore.description}
        descriptionHeader={chore.name}
        rightButtonLight
        rightButtonTextStyle={{ color: color.red }}
        rightButtonContainerStyle={{ borderColor: color.red }}
      />
    ));
  };

  const renderButtons = () => {
    return (
      <SetupButtons
        rightButtonContainer={
          forSettings ? { ...SAVE_BUTTON, width: '49%' } : {}
        }
        leftLabel={forSettings ? 'Cancel' : 'Back'}
        leftPress={onPrevPress || (() => {})}
        rightLabel={forSettings ? 'Save' : 'Next'}
        submit={forSettings ? settingsSubmit : onNextPress || (() => {})}
        navigation={props.navigation}
      />
    );
  };

  const { chores } = selectedHouse || {};
  return (
    <View style={{ flex: 1 }}>
      <RatsScrollView contentContainerStyle={SCROLL_CONTAINER}>
        {renderModal()}
        <SetupHeader
          header="Chores"
          text="Chores are jobs that must be done daily by the guests within your home.">
          {!isEmpty(chores) && renderChores()}
          <RatsButton
            title="ADD CHORE"
            onPress={
              isEmpty(chores) ? addChore : showModalHandler(new Chore(), 'add')
            }
            light
            style={STAT_BUTTON_TEXT}
            containerStyle={{ marginVertical: normalize(20) }}
          />
        </SetupHeader>
      </RatsScrollView>
      {forSettings && renderButtons()}
    </View>
  );
};

const ChoreSetupForm = withFormik<
  ManagerSetupProps & ChoreState,
  { [name: string]: Chore }
>({
  enableReinitialize: true,
  mapPropsToValues: props => {
    return {
      ...props.selectedHouse?.chores,
    };
  },
  validate: values => {
    const errors: Record<string, string> = {};
    const choreNames = Object.keys(values);

    for (const choreName of choreNames) {
      const chore = values[choreName];

      if (!chore.name) {
        errors[`${chore.name}.name`] = 'Required';
      }

      if (!chore.description) {
        errors[`${chore.name}.description`] = 'Required';
      }
    }

    return errors;
  },
  handleSubmit: (values, formikBag) => {
    const {
      updateHouse,
      selectedHouse,
      handleSubmit,
      guests,
      oldChore,
      newChore,
    } = formikBag.props;
    if (!selectedHouse?.id || !updateHouse) return;

    const updatedChores: Record<string, any> = {};
    const updatedGuests = cloneDeep(guests);
    if (oldChore && newChore) {
      // Note: Guest chore assignment should now be handled through activities
      // The currentWeek.chore logic is no longer needed
      // For now, we'll just update the house chores without modifying guests
    }
    forEach(values, (chore, key) => {
      if (chore && chore.name && chore.name.trim() !== '') {
        updatedChores[chore.name] = chore;
      }
    });
    updateHouse({ id: selectedHouse.id, chores: updatedChores });
  },
  //@ts-ignore
})(ChoreSetupFormView);

interface ChoreState {
  oldChore?: Chore | null;
  newChore?: Chore | null;
  setChores?: (oldChore: Chore, newChore: Chore, callback: () => void) => void;
}

const ChoreSetup: React.FC<ManagerSetupWithForm> = props => {
  const [oldChore, setOldChore] = useState<Chore | null>(null);
  const [newChore, setNewChore] = useState<Chore | null>(null);

  const dispatch = useAppDispatch();
  const organization = useAppSelector(state => state.setup.organization);
  const houses = useAppSelector(state => state.setup.houses);
  const selectedHouse = useAppSelector(state => state.setup.selectedHouse);
  const selectedPhase = useAppSelector(state => state.setup.selectedPhase);
  const guests = useAppSelector(state => state.setup.guests);

  const setChores = useCallback(
    (oldChore: Chore, newChore: Chore, callback: () => void) => {
      setOldChore(oldChore);
      setNewChore(newChore);
      if (callback) callback();
    },
    [],
  );

  return (
    <View style={{ flex: 1 }}>
      <ChoreSetupForm
        {...props}
        selectedHouse={selectedHouse || undefined}
        selectedPhase={selectedPhase || undefined}
        newChore={newChore || undefined}
        oldChore={oldChore || undefined}
        setChores={setChores}
      />
    </View>
  );
};

export default ChoreSetup;
