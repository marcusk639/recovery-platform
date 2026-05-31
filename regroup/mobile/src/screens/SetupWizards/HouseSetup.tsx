import React, { useState, useCallback, useEffect, useRef } from 'react';
// Phase 3.3: Migrated from withHouseSetupWizard HOC to useHouseSetupWizard hook
import { useHouseSetupWizard } from '../../hooks/useHouseSetupWizard';

import { withFormik, Field } from 'formik';
import ManagerSetupProps, { ManagerSetupWithForm } from './ManagerSetupEntity';
import { View } from 'react-native';
import { validateAddress } from '../../util/form';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import {
  color,
  HEADER,
  normalize,
  fontSize,
  SAVE_BUTTON,
} from '../../styles/theme';
import { House, houseSchema } from '../../entities/House';
import RatsRadioButtonGroup from '../../components/rats-radio-button-group';
import RatsScrollView from '../../components/rats-scroll-view';
import RatsNumericInput from '../../components/rats-numeric-input';
import { RatsSwitch } from '../../components/rats-switch';
import { RatsText } from '../../components/rats-text';
import { SetupButtons } from './OperatorSetupWizard';
import {
  getAddressDisplay,
  AddressKeys,
  AddressDetails,
} from '../../util/address';
import { phoneFormatter } from '../../util/formatters';
import KeyboardManager from 'react-native-keyboard-manager';
import { IOS, ANDROID } from '../../util/platform';
import RatsImagePicker from '../../components/rats-image-picker';
import isEmpty from 'lodash/isEmpty';

const labelColor = 'black';

type HouseSetupFormViewProps = ManagerSetupWithForm;

const HouseSetupFormView: React.FC<HouseSetupFormViewProps> = props => {
  const setupWizard = useHouseSetupWizard();
  const {
    values,
    setFieldValue,
    selectedHouse,
    handleSubmit,
    errors,
    forSettings,
    onPrevPress,
    navigation,
  } = props;
  const effectiveSelectedHouse = selectedHouse || setupWizard.selectedHouse;

  const [height, setHeight] = useState(ANDROID ? normalize(95) : 0);
  const [focused, setFocused] = useState('');

  const scrollRef = useRef<any>(null);
  const refsRef = useRef<{ [field: string]: any }>({});

  const setKeyboard = useCallback(() => {
    if (
      ANDROID &&
      refsRef.current.address &&
      refsRef.current.address.refs &&
      refsRef.current.address.refs.textInput
    ) {
      refsRef.current.address.refs.textInput.measure(
        (x: any, y: any, width: any, height: any, pageX: any, pageY: any) => {
          scrollRef.current?.scrollTo({ x: 0, y: pageY + normalize(50) });
        },
      );
    }
    if (IOS) {
      KeyboardManager.setEnable(true);
      KeyboardManager.setKeyboardDistanceFromTextField(normalize(100));
    } else {
      setHeight(normalize(115));
    }
    setFocused('address');
  }, []);

  const resetKeyboard = useCallback(() => {
    if (IOS) {
      KeyboardManager.setKeyboardDistanceFromTextField(0);
    } else {
      setHeight(normalize(95));
    }
  }, []);

  const initRef = useCallback(
    (name: string) => (ref: any) => {
      refsRef.current = { ...refsRef.current, [name]: ref };
    },
    [],
  );

  const addressChanged = useCallback(
    (prevHouse?: House) => {
      if (!prevHouse) {
        return false;
      }

      const res = AddressKeys.some(key => {
        return (values as any)[key] !== (prevHouse as any)[key];
      });

      return res;
    },
    [values],
  );

  const setAddress = useCallback(
    (prevHouse?: House) => {
      if (refsRef.current.address) {
        if (addressChanged(prevHouse)) {
          const address = getAddressDisplay(
            (values as any)?.street,
            (values as any)?.city,
            (values as any)?.state,
            (values as any)?.zip,
          );
          refsRef.current.address.setAddressText(address || '');
        } else {
          const address = effectiveSelectedHouse?.street
            ? getAddressDisplay(
                effectiveSelectedHouse.street,
                effectiveSelectedHouse?.city,
                effectiveSelectedHouse?.state,
                effectiveSelectedHouse?.zip,
              )
            : '';
          refsRef.current.address.setAddressText(address || '');
        }
      }
    },
    [values, effectiveSelectedHouse, addressChanged],
  );

  useEffect(() => {
    setAddress();
  }, []);

  useEffect(() => {
    setAddress(effectiveSelectedHouse || undefined);
  }, [effectiveSelectedHouse, setAddress]);

  const submit = useCallback(() => {
    handleSubmit();
    if (!isEmpty(errors)) {
      const fieldNames = Object.keys(errors);
      if (fieldNames && fieldNames.length) {
        const firstFieldRef = refsRef.current[fieldNames[0]];
        if (firstFieldRef && firstFieldRef.focus) {
          firstFieldRef.focus();
        }
      }
    }
  }, [handleSubmit, errors]);

  return (
    <View
      style={{ flex: 1, backgroundColor: color.white, paddingHorizontal: 0 }}>
      <RatsScrollView
        innerRef={ref => (scrollRef.current = ref)}
        enableOnAndroid
        enableResetScrollToCoords={false}
        enableAutomaticScroll={ANDROID}
        scrollEnabled
        // extraScrollHeight={ANDROID && normalize(120)}
        // extraHeight={ANDROID && normalize(120)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: normalize(20),
          flexGrow: 1,
        }}>
        <RatsText text="Details" style={{ ...HEADER, marginLeft: 0 }} />
        <RatsText
          style={{
            color: color.dark_grey,
            fontSize: fontSize.medium,
            marginBottom: normalize(10),
          }}
          text="First, we need some basic information about your house. This information will be available on your house listing for any potential guests looking for a recovery home."
        />
        <Field
          name="name"
          styleType="secondary"
          component={RatsTextInput}
          labelColor={labelColor}
          label="House Name"
          setRef={initRef('name')}
          testID="house-name-input"
        />
        {/* {renderField(
            'address',
            selectedHouse.street ? getAddressDisplay(selectedHouse.street, selectedHouse.city, selectedHouse.state, selectedHouse.zip) : 'Address',
            RatsTextInput,
            false,
            'Address',
            'string',
            labelColor
          )} */}
        <Field
          onFocus={setKeyboard}
          address
          keepResultsAfterBlur={false}
          listViewDisplayed={false}
          // onFieldBlur={this.resetKeyboard}
          styleType="secondary"
          component={RatsTextInput}
          labelColor={labelColor}
          name="address"
          label="Address"
          setRef={initRef('address')}
          testID="house-address-input"
        />
        <Field
          formatter={phoneFormatter}
          styleType="secondary"
          component={RatsTextInput}
          placeholder="(999) 123-4567"
          name="phoneNumber"
          label="Contact Number"
          keyboardType="phone-pad"
          labelColor={labelColor}
          setRef={initRef('phoneNumber')}
        />
        <RatsImagePicker
          onImageSelect={response => {
            const asset = response.assets?.[0];
            setFieldValue('imageUrl', asset?.uri);
          }}
          label="Photo (optional)"
          onClear={() => {
            setFieldValue('imageUrl', null);
          }}
          uri={values.imageUrl}
        />
        {/* {renderField('rentFrequency', 'weekly/monthly/both', RatsTextInput, false, 'Rent Frequency', 'string', labelColor)}
        {renderField('depositsAndFees', 'deposits/fees', RatsTextInput, false, 'Deposits/Fees', 'string', labelColor)} */}
        <Field
          name="monthlyRent"
          component={RatsNumericInput}
          minimumValue={0}
          maximumValue={50000}
          label="Monthly Rent"
        />
        <Field
          name="weeklyRent"
          component={RatsNumericInput}
          minimumValue={0}
          maximumValue={50000}
          label="Weekly Rent"
        />
        <Field
          name="depositsAndFees"
          component={RatsNumericInput}
          minimumValue={0}
          maximumValue={50000}
          label="Fees / Deposits"
        />
        <Field
          name="maximumCapacity"
          component={RatsNumericInput}
          minimumValue={1}
          maximumValue={50}
          label="How many beds are in this house?"
          testID="house-capacity-input"
        />
        <Field name="wifi" component={RatsSwitch} label="Wifi Offered" />
        <Field
          component={RatsRadioButtonGroup}
          name="certified"
          label="Certification Status"
          labelDisabled={false}
          formHorizontal={true}
          labelHorizontal={true}
          wrapStyle={{ marginHorizontal: 0, marginRight: normalize(15) }}
          selectedButtonColor={color.black}
          radioButtons={[
            { label: 'Certified', value: true },
            { label: 'Not Certified', value: false },
          ]}
        />
        <Field
          component={RatsRadioButtonGroup}
          name="houseType"
          label="House Type"
          labelDisabled={false}
          formHorizontal={true}
          labelHorizontal={true}
          wrapStyle={{ marginHorizontal: 0, marginRight: normalize(15) }}
          selectedButtonColor={color.black}
          radioButtons={[
            { label: 'Traditional', value: 'traditional' },
            { label: 'Oxford House', value: 'oxford' },
          ]}
        />
        <Field
          component={RatsRadioButtonGroup}
          name="gender"
          setRef={initRef('gender')}
          label="Guest Gender"
          labelDisabled={false}
          formHorizontal={true}
          labelHorizontal={true}
          wrapStyle={{ marginHorizontal: 0, marginRight: normalize(15) }}
          selectedButtonColor={color.black}
          radioButtons={[
            { label: 'Male', value: 'male' },
            { label: 'Female', value: 'female' },
            { label: 'Non-binary', value: 'non-binary' },
          ]}
          testID="house-type-selector"
        />
      </RatsScrollView>
      {forSettings && (
        <SetupButtons
          rightLabel={forSettings ? 'Save' : 'Next'}
          leftLabel="Cancel"
          rightButtonContainer={
            forSettings ? { ...SAVE_BUTTON, width: '49%' } : {}
          }
          submit={submit}
          leftPress={onPrevPress ? onPrevPress : navigation.goBack}
          navigation={navigation}
        />
      )}
    </View>
  );
};

const initialValues = new House();

const HouseSetupForm = withFormik<ManagerSetupProps, House>({
  enableReinitialize: true,
  mapPropsToValues: props =>
    props.selectedHouse ? props.selectedHouse : initialValues,
  handleSubmit: (values, formikBag) => {
    if (formikBag.props.handleSubmit) {
      formikBag.props.handleSubmit(values);
    } else {
      if (formikBag.props.updateHouse) {
        formikBag.props.updateHouse(values);
      }
      // this.props.navigation.navigate(Routes.HouseSetup);
      if (formikBag.props.onNextPress) {
        formikBag.props.onNextPress();
      }
    }
  },
  validate: async values => {
    const errors: Record<string, string> = {};
    try {
      // const result = await houseSchema.validate(values);
      await houseSchema.validate(values, { abortEarly: false });
    } catch (error: any) {
      error.inner.forEach((error: any) => {
        errors[error.path] = error.message;
      });
    }
    const address: Record<string, any> = {};
    AddressKeys.forEach(
      key => (address[key] = (values as Record<string, any>)[key]),
    );
    const addressErrors = await validateAddress(
      address as AddressDetails,
      'address',
    );
    const result = { ...errors, ...addressErrors };
    if (!isEmpty(result)) {
      return result;
    }
  },
  //@ts-ignore
})(HouseSetupFormView);

export const HouseSetup: React.FC<ManagerSetupWithForm> = props => {
  return <HouseSetupForm {...props} />;
};

export default HouseSetup;
