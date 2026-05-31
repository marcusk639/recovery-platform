import { Field, FormikProps } from 'formik';
import { View } from 'react-native';
import React, { useRef, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import styles from './GuestUpdateStyles';
import RatsButton from '../../components/rats-button/rats-button';
import RatsCheckBox from '../../components/rats-checkbox/rats-checkbox';
import RatsDatePicker from '../../components/rats-datepicker/rats-datepicker';
import settings from '../../settings/time';
import { RatsText } from '../../components/rats-text';
import { normalize } from '../../styles/theme';
import { GuestUpdateProps } from './GuestUpdateForm';

const GuestUpdateFormView: React.FC<
  GuestUpdateProps & FormikProps<any>
> = props => {
  const { handleSubmit, isSubmitting, status, guest } = props;

  const scrollRef = useRef<any>(null);

  const getField = useCallback(
    (fieldName: string, fieldValue: any): JSX.Element => {
      let component: any;
      const isDate = fieldName.toLowerCase().includes('date');

      if (isDate) {
        component = RatsDatePicker;
      } else if (typeof fieldValue === 'boolean') {
        component = RatsCheckBox;
      } else {
        component = RatsTextInput;
      }

      let placeholder = fieldName;
      if (isDate) {
        placeholder =
          fieldValue.length === 0
            ? format(
                new Date(),
                settings.dateFormat.replace('YYYY', 'yyyy').replace('DD', 'dd'),
              )
            : fieldValue;
      }

      // Generate testID based on field name
      const testID = `guest-${fieldName
        .toLowerCase()
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()}-input`;

      return (
        <Field
          key={fieldName}
          component={component}
          placeholder={placeholder}
          name={fieldName}
          disabled={isSubmitting}
          testID={testID}
        />
      );
    },
    [isSubmitting],
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ y: 0 });
    }
  }, [guest?.id]);

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.formContainer}
      resetScrollToCoords={{ x: 0, y: 0 }}
      scrollEnabled
      innerRef={ref => {
        scrollRef.current = ref;
      }}>
      <View style={{ width: '100%' }}>
        {getField('firstName', guest.firstName)}
        {getField('lastName', guest.lastName)}
        {getField('email', guest.email)}
        {getField('phoneNumber', guest.phoneNumber)}
        {getField('sobrietyDate', guest.sobrietyDate)}
        {getField('drugOfChoice', guest.drugOfChoice)}
        {getField('dailyHabit', guest.dailyHabit)}
        {getField('rentOwed', guest.rentOwed)}
        {getField('choreFees', guest.choreFees)}
        {getField('phase', guest.phase)}
      </View>
      <View style={{ alignSelf: 'center', marginBottom: normalize(50) }}>
        <RatsButton
          testID="create-guest-button"
          title="Submit"
          onPress={handleSubmit as any}
          disabled={isSubmitting}
        />
      </View>
    </KeyboardAwareScrollView>
  );
};

export default GuestUpdateFormView;
