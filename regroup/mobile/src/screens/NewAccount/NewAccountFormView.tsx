import React, { useState, useCallback, useEffect } from 'react';
import { Field, FormikProps } from 'formik';
// Phase 3.3: Removed withRats HOC (translation/theme available globally via useTranslation and ThemeProvider)
import { useTranslation } from '../../context';
import { View } from 'react-native';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import styles from './NewAccountStyles';
import RatsButton from '../../components/rats-button/rats-button';
import {
  fontFamily,
  color,
  HEADER,
  fontSize,
  normalize,
} from '../../styles/theme';
import { phoneFormatter } from '../../util/formatters';
import RatsDatePicker from '../../components/rats-datepicker/rats-datepicker';
import RatsRadioButtonGroup from '../../components/rats-radio-button-group';
import RatsPicker from '../../components/rats-picker/rats-picker';
import { getPickerItems } from '../../util/display';
import maritalStatus from '../../constants/maritalStatus';
import housingStatus from '../../constants/housingStatus';
import ethnicity from '../../constants/ethnicity';
import { NewAccountFormProps } from './NewAccountForm';
import { User } from '../../entities/User';

import SetupHeader from '../../components/setup-header';
import { RatsText } from '../../components/rats-text';

const NewAccountFormView: React.FC<
  NewAccountFormProps & FormikProps<Partial<User>>
> = props => {
  const { isSubmitting, handleSubmit } = props;
  const { t } = useTranslation();

  const renderField = useCallback(
    (
      fieldName: string,
      placeholder: string,
      component: React.ComponentType<any>,
      label?: string,
    ) => {
      return (
        <Field
          formatter={fieldName === 'phoneNumber' ? phoneFormatter : null}
          styleType="secondary"
          component={component}
          placeholder={t(placeholder)}
          name={fieldName}
          labelColor={color.black}
          disabled={isSubmitting}
          label={label}
          keyboardType={
            fieldName === 'phoneNumber' || fieldName === 'ssn'
              ? 'phone-pad'
              : 'default'
          }
          testID={fieldName === 'phoneNumber' ? 'phone-input' : undefined}
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
          labelStyle={{ fontFamily: fontFamily.roboto, color: color.black }}
        />
      );
    },
    [],
  );

  return (
    <View style={styles.newAccountForm} testID="new-account-screen">
      <RatsText
        style={{
          color: color.dark_grey,
          fontSize: fontSize.medium,
          marginVertical: normalize(10),
        }}
        text={
          'We need to collect some basic information from you before you begin using the app.'
        }
      />
      <View>
        {renderField('firstName', 'enter.first.name', RatsTextInput)}
        {renderField('lastName', 'enter.last.name', RatsTextInput)}
        {renderField('middleInitial', 'Middle Initial', RatsTextInput)}
        {renderField('phoneNumber', '(000) 000-0000', RatsTextInput)}
        {renderField('dateOfBirth', 'date', RatsDatePicker)}
        {renderPicker(
          'maritalStatus',
          getPickerItems(maritalStatus, t),
          'marital.status',
        )}
        {renderPicker(
          'housingStatus',
          getPickerItems(housingStatus, t),
          'housing.status',
        )}
        {/* {renderPicker('ethnicity', getPickerItems(ethnicity, t), 'ethnicity')} */}
        <Field
          component={RatsRadioButtonGroup}
          name="gender"
          label="Gender"
          disabled={isSubmitting}
          labelDisabled={false}
          formHorizontal={true}
          labelHorizontal={true}
          selectedButtonColor={color.black}
          radioButtons={[
            { label: 'Male', value: 'male' },
            { label: 'Female', value: 'female' },
            { label: 'Non-binary', value: 'non-binary' },
          ]}
        />
      </View>
      <RatsButton
        testID="continue-button"
        containerStyle={styles.createAccountButton}
        title="Next"
        onPress={handleSubmit as any}
      />
    </View>
  );
};

export default NewAccountFormView;
