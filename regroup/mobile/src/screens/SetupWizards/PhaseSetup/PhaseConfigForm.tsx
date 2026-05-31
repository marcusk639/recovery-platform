import React, { Fragment } from 'react';
import { withFormik, FormikProps, Field } from 'formik';
// Phase 4.1: Extracted business logic to usePhaseForm hook
import { usePhaseForm } from './hooks/usePhaseForm';
import { ManagerSetupWithForm } from '../ManagerSetupEntity';
import { PhaseConfiguration } from '../../../entities/Phase';
import { House } from '../../../entities/House';
import RatsScrollView from '../../../components/rats-scroll-view';
import {
  SCROLL_CONTAINER,
  normalize,
  color,
  CARD_STYLE,
  fontSize,
  ROW,
  STAT_BUTTON,
  STAT_BUTTON_TEXT,
} from '../../../styles/theme';
import { Weekdays } from '../../../components/weekdays';
import { View, Dimensions, ViewStyle, TextStyle } from 'react-native';
import {
  militaryTimeToDate,
} from '../../../util/display';
import { RatsSwitch } from '../../../components/rats-switch';
import { renderField } from '../../../util/form';
import RatsTextInput from '../../../components/rats-text-input/rats-text-input';
import RatsNumericInput from '../../../components/rats-numeric-input';
import RatsButton from '../../../components/rats-button/rats-button';
import { cloneDeep, each, find } from 'lodash';

import WeekdayWithTime from '../../../components/weekdays/weekday-with-time';
import ScreenHeader from '../../../components/screen-header';
import HelpIcon from '../../../components/help-icon';
import { RatsText } from '../../../components/rats-text';
import { NEXT_BUTTON, NEXT_BUTTON_TEXT } from '../SetupStyles';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SetupHeader } from '../OperatorSetupWizard';
import { RatsHR } from '../../../components/rats-horizontal-rule';
import { IOS } from '../../../util/platform';
import {
  withPopover,
  WithPopoverProps,
} from '../../../components/rats-hoc/withPopover';
import DateTimePicker from '@react-native-community/datetimepicker';
import DatePicker from 'react-native-date-picker';

const DAY_CONTAINER: ViewStyle = {
  width: Dimensions.get('screen').width / 5,
  height: normalize(45),
  borderColor: color.black,
  borderWidth: 1,
  borderRadius: 5,
  backgroundColor: color.white,
};

type Props = FormikProps<PhaseConfiguration> & WithPopoverProps & {
  setCustomPhase: (phase: PhaseConfiguration) => any;
  dismissModal: () => void;
  customize?: boolean;
  header?: string;
  description?: string;
};

const PhaseConfigFormView: React.FC<Props> = props => {
  const { values, setFieldValue, handleSubmit, dismissModal, customize, header, description, showPopover } = props;

  // Use custom hook for business logic
  const phaseForm = usePhaseForm({
    values,
    setFieldValue,
    handleSubmit,
    dismissModal,
    setPopover: (visible: boolean, heading: string, content: string) => {
      showPopover(content);
    },
  });

  const {
    show,
    setShow,
    renderHelp,
    setTime,
    onWeekdayPress,
    Weekday,
    getTime,
    onHasCurfewChange,
    onOvernightChange,
    onChoresChange,
    onRequiresMeetingsChange,
    onRequiresWorkChange,
    onRequiresSponsorChange,
    handleSubmitClick,
  } = phaseForm;

  const renderButtons = () => {
    return (
      <View
        style={{ paddingTop: normalize(10), justifyContent: 'space-between' }}>
        <View
          style={{
            ...ROW,
            justifyContent: 'space-between',
            marginTop: 'auto',
          }}>
          <RatsButton
            light
            title="CANCEL"
            onPress={dismissModal}
            containerStyle={{ ...STAT_BUTTON, flex: 0.48 }}
            style={STAT_BUTTON_TEXT}
          />
          <RatsButton
            title="APPLY"
            onPress={handleSubmitClick}
            containerStyle={{
              flex: 0.48,
              width: '100%',
              marginTop: 0,
              marginBottom: 0,
            }}
          />
        </View>
      </View>
    );
  };

  const SWITCH_CONTAINER: ViewStyle = {
    // width: '100%'
    marginHorizontal: 0,
  };
  const SWITCH_STYLE: ViewStyle = {
    marginLeft: 'auto',
    marginRight: 0,
  };
  const SECTION: ViewStyle = {
    // ...CARD_STYLE,
    marginBottom: 1,
  };
  const NUMERIC_CONTAINER: ViewStyle = {
    // paddingHorizontal: normalize(10)
  };
  const NUMERIC_LABEL: TextStyle = {
    color: color.dark_grey,
    fontSize: fontSize.regular - 2,
  };
  const HR: ViewStyle = {
    borderBottomWidth: 1,
    marginVertical: normalize(10),
  };

  return (
    <RatsScrollView contentContainerStyle={[SCROLL_CONTAINER]}>
      <SafeAreaView
        style={{ backgroundColor: color.light_grey }}
        edges={['top', 'bottom']}>
        <ScreenHeader
          renderBackButton
          onBackPress={dismissModal}
          icon={
            <HelpIcon
              helpFn={renderHelp}
            />
          }
          header="Phase Setup"
        />
        <SetupHeader
          header={header || 'Phase setup'}
          text={
            description ||
            'A phase is a set of rules that guests must follow if they are currently in that phase.'
          }>
          {!customize && (
            <Fragment>
              <View style={SECTION}>
                {renderField(
                  'name',
                  'phase name',
                  RatsTextInput,
                  false,
                  'Phase Name',
                  'string',
                  color.black,
                  undefined,
                )}
                <Field
                  name="order"
                  label="Phase Number"
                  component={RatsNumericInput}
                  maximumValue={10}
                  // labelStyle={NUMERIC_LABEL}
                  containerStyle={NUMERIC_CONTAINER}
                />
              </View>
              <RatsHR style={HR} />
            </Fragment>
          )}
          {customize && <RatsHR style={HR} />}
          <View style={SECTION}>
            <RatsSwitch
              containerStyle={{ ...SWITCH_CONTAINER }}
              style={SWITCH_STYLE}
              label="Curfew Required"
              onValueChange={onHasCurfewChange}
              value={values.rules?.curfew?.required}
            />
            {values.rules?.curfew?.required && (
              <View style={{ marginBottom: normalize(10) }}>
                <RatsText
                  style={{ ...NUMERIC_LABEL, marginBottom: normalize(5) }}
                  translate={false}
                  text="Set the curfew for each day:"
                />
                <Weekdays
                  containerStyle={DAY_CONTAINER}
                  alwaysEnabled
                  displayDaysToGo={false}
                  onWeekdayPress={onWeekdayPress}
                  customWeekdayContent={(day: string) => {
                    const { time, day: displayDay } = Weekday(day);
                    return (
                      <WeekdayWithTime
                        value={new Date()}
                        time={time}
                        day={displayDay}
                      />
                    );
                  }}
                />
              </View>
            )}
          </View>
          <RatsHR style={HR} />
          <View style={SECTION}>
            <RatsSwitch
              containerStyle={SWITCH_CONTAINER}
              style={SWITCH_STYLE}
              label="Overnights Allowed"
              onValueChange={onOvernightChange}
              value={values.rules.nightsOutAllowed > 0}
            />
            {values.rules.nightsOutAllowed > 0 && (
              <Field
                name="rules.nightsOutAllowed"
                labelStyle={NUMERIC_LABEL}
                component={RatsNumericInput}
                label={
                  customize
                    ? 'How many nights out are allowed for this guest?'
                    : 'How many nights out are allowed for a guest in this phase?'
                }
                containerStyle={NUMERIC_CONTAINER}
              />
            )}
          </View>
          <RatsHR style={HR} />
          <View style={SECTION}>
            <RatsSwitch
              containerStyle={SWITCH_CONTAINER}
              style={SWITCH_STYLE}
              label="Chores Required"
              onValueChange={onChoresChange}
              value={values.rules.chore}
            />
          </View>
          <RatsHR style={HR} />
          <View style={SECTION}>
            <RatsSwitch
              containerStyle={SWITCH_CONTAINER}
              style={SWITCH_STYLE}
              label="Meetings Required"
              onValueChange={onRequiresMeetingsChange}
              value={values.rules.meetings > 0}
            />
            {values.rules.meetings > 0 && (
              <Field
                name="rules.meetings"
                component={RatsNumericInput}
                labelStyle={NUMERIC_LABEL}
                label={
                  customize
                    ? 'How many meetings must this guest attend?'
                    : 'How many meetings must a guest in this phase attend?'
                }
                maximumValue={20}
                containerStyle={NUMERIC_CONTAINER}
              />
            )}
          </View>
          <RatsHR style={HR} />
          <View style={SECTION}>
            <RatsSwitch
              containerStyle={SWITCH_CONTAINER}
              style={SWITCH_STYLE}
              label="Work Required"
              onValueChange={onRequiresWorkChange}
              value={values.rules.work > 0}
            />
            {values.rules.work > 0 && (
              <Field
                name={'rules.work'}
                label={
                  customize
                    ? 'How many hours must this guest work?'
                    : 'How many hours must a guest in this phase work?'
                }
                component={RatsNumericInput}
                maximumValue={80}
                labelStyle={NUMERIC_LABEL}
                containerStyle={NUMERIC_CONTAINER}
              />
            )}
          </View>
          <RatsHR style={HR} />
          <View style={SECTION}>
            <RatsSwitch
              containerStyle={SWITCH_CONTAINER}
              style={SWITCH_STYLE}
              label="Sponsorship Required"
              onValueChange={onRequiresSponsorChange}
              value={values.rules.supporter}
            />
          </View>
          <RatsHR style={HR} />
          {/* <RatsSwitch
            containerStyle={{ margin: 0, marginLeft: 0 }}
            label="Medication Tracking"
            onValueChange={() => this.setState({ requiresMeds: !this.state.requiresMeds })}
            value={this.state.requiresMeds}
          /> */}
          <DatePicker
            modal
            mode="time"
            open={show}
            date={getTime()}
            onConfirm={date => {
              setTime(date);
            }}
            onCancel={() => {
              setShow(false);
            }}
          />
          <View>{renderButtons()}</View>
        </SetupHeader>
      </SafeAreaView>
    </RatsScrollView>
  );
};

export const PhaseConfigForm = withFormik<
  ManagerSetupWithForm & {
    dismissModal: () => void;
    setCustomPhase: (phase: PhaseConfiguration) => any;
  },
  PhaseConfiguration
>({
  mapPropsToValues: props => {
    return props.phase || new PhaseConfiguration();
  },
  handleSubmit: (values, formikBag) => {
    const {
      updateHouse,
      selectedHouse,
      phase,
      dismissModal,
      guests,
      setCustomPhase,
    } = formikBag.props;
    if (setCustomPhase) {
      setCustomPhase(values);
      dismissModal();
      return;
    }
    if (!selectedHouse || !phase) {
      dismissModal();
      return;
    }
    const house = cloneDeep(selectedHouse) as House;
    const updatedGuests = guests ? cloneDeep(guests) : undefined;
    // if the name changes, we need to delete it so we can reset the key on the phases object in the house
    if (phase.name !== values.name) {
      delete house?.phases[phase.name];
      // find guest with that phase name
      const guestWithPhase = find(
        updatedGuests,
        guest => guest.phase === phase.name,
      );
      if (guestWithPhase && updatedGuests) {
        updatedGuests[guestWithPhase.id] = {
          ...guestWithPhase,
          phase: values.name,
        };
      }
    }
    if (updateHouse && house?.id) {
      updateHouse({
        ...house,
        id: house.id,
        phases: { ...house?.phases, [values.name]: values }
      });
    }
    dismissModal();
    // if there is no curfew, make sure to persist that
  },
  validate: (values, props) => {
    const { selectedHouse } = props;
    const phases = selectedHouse?.phases;
    let maxOrder = 0;
    each(
      phases,
      phase => (maxOrder = phase.order > maxOrder ? phase.order : maxOrder),
    );
    const errors: { name?: string; order?: string } = {};
    if (!values.name) {
      errors.name = 'Required';
    }
    if (!values.order) {
      errors.order = 'Required';
    }
    if (values.order > maxOrder + 1) {
      errors.order = `Phases must be sequential. Should this number be ${
        maxOrder + 1
      }?`;
    }
    return errors;
  },
  //@ts-ignore
})(withPopover(PhaseConfigFormView));

export default PhaseConfigForm;
