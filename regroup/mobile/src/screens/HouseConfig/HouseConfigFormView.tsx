import React, { Fragment, useState, useCallback, useEffect } from 'react';
import { Field, FormikProps } from 'formik';
// Phase 3.3: Removed withRats HOC (translation/theme available globally via useTranslation and ThemeProvider)
import { useTranslation } from '../../context';
import { View } from 'react-native';
import styles from './HouseConfigStyles';
import { isEmpty, map, some } from 'lodash';
import * as uuid from 'uuid';
import RatsButton from '../../components/rats-button/rats-button';
import { fontFamily } from '../../styles/theme';
import { phoneFormatter } from '../../util/formatters';
import RatsPicker from '../../components/rats-picker/rats-picker';

import { HouseConfigFormProps, HouseConfigFormValues } from './HouseConfigForm';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import { PhaseConfiguration } from '../../entities/Phase';
import RatsNumericInput from '../../components/rats-numeric-input';
import RatsCheckBox from '../../components/rats-checkbox/rats-checkbox';
import { Chore } from '../../entities/Chore';
import Admin from '../../entities/Admin';
import { Routes } from '../../navigation/types';

const HouseConfigFormView: React.FC<
  HouseConfigFormProps & FormikProps<HouseConfigFormValues>
> = props => {
  const { isSubmitting, handleSubmit, navigation } = props;
  const { t } = useTranslation();

  const [phaseConfigs, setPhaseConfigs] = useState<{
    [key: string]: PhaseConfiguration | null;
  }>({
    default: new PhaseConfiguration(),
  });
  const [chores, setChores] = useState<{ [key: string]: Chore | null }>({});
  const [admins, setAdmins] = useState<{ [key: string]: Admin | null }>({});

  const renderField = useCallback(
    (
      fieldName: string,
      placeholder: string,
      component: React.ComponentType<any>,
      label?: string,
      inputType?: 'string' | 'number' | undefined,
      disabled?: boolean,
    ) => {
      return (
        <Field
          addressPath
          formatter={fieldName.includes('phoneNumber') ? phoneFormatter : null}
          styleType="secondary"
          component={component}
          placeholder={t(placeholder)}
          name={fieldName}
          disabled={isSubmitting || disabled}
          label={label}
          keyboardType={inputType === 'number' ? 'phone-pad' : 'default'}
        />
      );
    },
    [isSubmitting, t],
  );

  const renderPicker = useCallback(
    (fieldName: string, items: any[], label: string) => {
      return (
        <Field
          component={RatsPicker}
          label={label}
          name={fieldName}
          items={items}
          labelStyle={{ fontFamily: fontFamily.roboto }}
        />
      );
    },
    [],
  );

  const addPhase = useCallback(() => {
    const id: string = uuid.v4();
    setPhaseConfigs(prevState => ({
      ...prevState,
      [id]: new PhaseConfiguration(),
    }));
  }, []);

  const addChore = useCallback(() => {
    const id: string = uuid.v4();
    setChores(prevState => ({ ...prevState, [id]: new Chore() }));
  }, []);

  const addAdmin = useCallback(() => {
    const id: string = uuid.v4();
    setAdmins(prevState => ({ ...prevState, [id]: new Admin('') }));
  }, []);

  const initialPhaseChosen = useCallback(() => {
    return some(phaseConfigs, phaseConfig => !!(phaseConfig && phaseConfig.order === 1));
  }, [phaseConfigs]);

  const renderPhaseConfigForms = useCallback(() => {
    const phases = phaseConfigs;
    return map(phases, (phase, key) => {
      if (key !== 'default' && phase !== null) {
        const removePhase = () =>
          setPhaseConfigs(prevState => ({
            ...prevState,
            [key]: null,
          }));
        return (
          <Fragment key={key}>
            {renderField(
              `house.phases[${key}].name`,
              'Phase Name',
              RatsTextInput,
              'Phase Name',
            )}
            {renderField(
              `house.phases[${key}].order`,
              '1',
              RatsNumericInput,
              'Order',
              'number',
              false,
            )}
            {renderField(
              `house.phases[${key}].rules.meetings`,
              'Number of Meetings Required',
              RatsNumericInput,
              'Meetings',
              'number',
            )}
            {renderField(
              `house.phases[${key}].rules.weekendCurfew`,
              'Weekend Curfew',
              RatsTextInput,
              'Weekend Curfew',
            )}
            {renderField(
              `house.phases[${key}].rules.weekCurfew`,
              'Weekday Curfew',
              RatsTextInput,
              'Weekday Curfew',
            )}
            {renderField(
              `house.phases[${key}].rules.nightsOutAllowed`,
              'Number of Nights Out Allowed',
              RatsNumericInput,
              'Nights Out Allowed',
              'number',
            )}
            {renderField(
              `house.phases[${key}].rules.supporter`,
              '',
              RatsCheckBox,
              'Supporter',
            )}
            {renderField(
              `house.phases[${key}].rules.work`,
              'Hours of Work Required',
              RatsNumericInput,
              'Work',
              'number',
            )}
            {renderField(
              `house.phases[${key}].rules.chore`,
              'Chore',
              RatsCheckBox,
              'Chore',
            )}
            <RatsButton
              containerStyle={styles.createAccountButton}
              title="Remove Phase"
              onPress={removePhase}
            />
          </Fragment>
        );
      }
    });
  }, [phaseConfigs, renderField, initialPhaseChosen]);

  const renderChoreForms = useCallback(() => {
    return map(chores, (chore, key) => {
      if (chore !== null && !isEmpty(chore)) {
        const removeChore = () =>
          setChores(prevState => ({
            ...prevState,
            [key]: null,
          }));
        return (
          <Fragment key={key}>
            {renderField(
              `house.chores[${key}].name`,
              'Chore Name',
              RatsTextInput,
              'Chore Name',
            )}
            {renderField(
              `house.chores[${key}].description`,
              'Chore Description',
              RatsTextInput,
              'Chore Description',
            )}
            <RatsButton
              containerStyle={styles.createAccountButton}
              title="Remove Chore"
              onPress={removeChore}
            />
          </Fragment>
        );
      }
    });
  }, [chores, renderField]);

  const renderAdminForms = useCallback(() => {
    return map(admins, (admin, index) => {
      if (admin !== null && !isEmpty(admin)) {
        const removeAdmin = () =>
          setAdmins(prevState => ({
            ...prevState,
            [index]: null,
          }));
        return (
          <Fragment key={`admin_${index}`}>
            {renderField(
              `admins[${index}].firstName`,
              'Admin First Name',
              RatsTextInput,
              'Admin First Name',
            )}
            {renderField(
              `admins[${index}].lastName`,
              'Admin Last Name',
              RatsTextInput,
              'Admin Last Name',
            )}
            <RatsButton
              containerStyle={styles.createAccountButton}
              title="Remove Admin"
              onPress={removeAdmin}
            />
          </Fragment>
        );
      }
    });
  }, [admins, renderField]);

  return (
    <View style={styles.newAccountForm}>
      <View>
        {renderField('house.name', 'House Name', RatsTextInput, 'Name')}
        {renderField(
          'house.street',
          'Address',
          RatsTextInput,
          'Address',
        )}
        {renderField(
          'house.rent',
          'Rent',
          RatsTextInput,
          'Rent',
          'number',
        )}
        {renderField(
          'house.maximumCapacity',
          'Capacity',
          RatsTextInput,
          'Capacity',
          'number',
        )}
        {renderField(
          'house.phoneNumber',
          '(123) 456-7890',
          RatsTextInput,
          'Phone Number',
          'number',
        )}
        {renderPhaseConfigForms()}
        <RatsButton
          containerStyle={styles.createAccountButton}
          title="Add Phase"
          onPress={addPhase}
        />
        {renderChoreForms()}
        <RatsButton
          containerStyle={styles.createAccountButton}
          title="Add Chore"
          onPress={addChore}
        />
        {renderAdminForms()}
        <RatsButton
          containerStyle={styles.createAccountButton}
          title="Add Admin"
          onPress={addAdmin}
        />
      </View>
      <RatsButton
        containerStyle={styles.createAccountButton}
        title="Next"
        onPress={() => handleSubmit()}
      />
      <RatsButton
        containerStyle={styles.createAccountButton}
        title="House Search"
        onPress={() => navigation.navigate(Routes.HouseSearch)}
      />
    </View>
  );
};

export default HouseConfigFormView;
