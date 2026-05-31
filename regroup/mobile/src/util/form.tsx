import { Field } from 'formik';
import React from 'react';
import { phoneFormatter } from './formatters';
import RatsPicker from '../components/rats-picker/rats-picker';
import { fontFamily } from '../styles/theme';
import { TextStyle } from 'react-native';
import * as yup from 'yup';
import SchemaConstants from '../entities/SchemaConstants';
import { AddressDetails } from './address';

export function renderField(
  fieldName: string,
  placeholder: string,
  component: any,
  disabled: boolean = false,
  label?: string,
  inputType?: 'string' | 'number' | undefined,
  labelColor?: string,
  labelStyle?: TextStyle,
  touchedValue?: boolean,
  renderCornerIcon?: () => JSX.Element,
  style?: any,
  numberOfLines?: number,
  lowercase?: boolean,
  labelDisabled?: boolean,
  sideButtonPress?: () => void,
  autoCapitalize?: any,
) {
  return (
    <Field
      key={fieldName}
      address={fieldName === 'address'}
      formatter={fieldName === 'phoneNumber' ? phoneFormatter : null}
      styleType="secondary"
      component={component}
      placeholder={placeholder}
      labelDisabled={labelDisabled}
      labelColor={labelColor}
      name={fieldName}
      disabled={disabled}
      labelStyle={labelStyle}
      label={label}
      lowercase={lowercase}
      touchedValue={touchedValue}
      keyboardType={inputType === 'number' ? 'phone-pad' : 'default'}
      renderCornerIcon={renderCornerIcon}
      numberOfLines={numberOfLines}
      minHeight={numberOfLines}
      sideButtonPress={sideButtonPress}
      autoCapitalize={autoCapitalize}
    />
  );
}

export function renderPicker(fieldName: string, items: any[], label: string) {
  return (
    <Field
      component={RatsPicker}
      label={label}
      name={fieldName}
      items={items}
      labelStyle={{ fontFamily: fontFamily.roboto }}
    />
  );
}

export function validateEmail(email: string) {
  var re =
    /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).trim().toLowerCase());
}

const addressSchema = yup.object().shape({
  city: yup.string().required(SchemaConstants.REQUIRED),
  zip: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .matches(/^([0-9]{5}(?:-[0-9]{4})?)*$/),
  state: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .matches(
      /^(?:A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])*$/,
      'Must be a valid 2 letter state code.',
    ),
  street: yup.string().required(SchemaConstants.REQUIRED),
  lat: yup.number().required(SchemaConstants.REQUIRED),
  lng: yup.number().required(SchemaConstants.REQUIRED),
});

export const EmailSchema = yup
  .string()
  .trim()
  .email(SchemaConstants.EMAIL)
  .max(50, SchemaConstants.stringMax(50))
  .required('Please enter an e-mail.');

export async function validateAddress(
  address: AddressDetails,
  fieldName: string,
) {
  let errors: Record<string, string> = {};
  try {
    await addressSchema.validate(address, { abortEarly: false });
  } catch (error) {
    errors[fieldName] = 'Must be a valid street address';
  }
  return errors;
}
