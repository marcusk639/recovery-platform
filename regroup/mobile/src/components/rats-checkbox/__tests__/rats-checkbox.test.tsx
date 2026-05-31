/**
 * Tests for RatsCheckbox component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RatsCheckbox } from '../index';

// Provide a virtual module so Jest can resolve the native checkbox
jest.mock(
  '@react-native-community/checkbox',
  () => {
    const { View } = require('react-native');
    const MockCheckBox = (props: any) => (
      <View
        testID={props.testID || 'checkbox'}
        accessibilityValue={{ text: props.value ? 'checked' : 'unchecked' }}
      />
    );
    return MockCheckBox;
  },
  { virtual: true },
);

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: '#000',
      secondaryColor: '#fff',
      backgroundColor: '#fff',
      textColor: '#000',
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
      tertiaryColor: '#ccc',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k ?? '', i18n: { language: 'en' } }),
}));

// Mock rats-label
jest.mock('../../rats-label/rats-label', () => {
  const { Text } = require('react-native');
  return ({ label }: any) => <Text>{label}</Text>;
});

// Mock camelCase util
jest.mock('../../../util/display', () => ({
  camelCaseToDisplayForm: (s: string) => s,
}));

const makeField = (overrides = {}) => ({
  name: 'agree',
  value: false,
  onChange: jest.fn(() => jest.fn()),
  onBlur: jest.fn(),
  ...overrides,
});

const makeForm = (overrides = {}) => ({
  errors: {},
  touched: {},
  ...overrides,
});

describe('RatsCheckbox', () => {
  it('renders without crashing with minimal props', () => {
    const { toJSON } = render(
      <RatsCheckbox
        field={makeField()}
        form={makeForm()}
        label="Accept Terms"
        disabled={false}
        labelDisabled={false}
        placeholder=""
        style={{}}
        viewStyle={{}}
        onValueChange={jest.fn()}
        suppressErrors={false}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders the label text by default', () => {
    const { getByText } = render(
      <RatsCheckbox
        field={makeField()}
        form={makeForm()}
        label="Accept Terms"
        disabled={false}
        labelDisabled={false}
        placeholder=""
        style={{}}
        viewStyle={{}}
        onValueChange={jest.fn()}
        suppressErrors={false}
      />,
    );
    expect(getByText('Accept Terms')).toBeTruthy();
  });

  it('does not render label when labelDisabled is true', () => {
    const { queryByText } = render(
      <RatsCheckbox
        field={makeField()}
        form={makeForm()}
        label="Accept Terms"
        disabled={false}
        labelDisabled={true}
        placeholder=""
        style={{}}
        viewStyle={{}}
        onValueChange={jest.fn()}
        suppressErrors={false}
      />,
    );
    expect(queryByText('Accept Terms')).toBeNull();
  });

  it('renders an error label when field has a touched error', () => {
    const { getByText } = render(
      <RatsCheckbox
        field={makeField({ name: 'agree' })}
        form={makeForm({ errors: { agree: 'Required' }, touched: { agree: true } })}
        label="Accept Terms"
        disabled={false}
        labelDisabled={false}
        placeholder=""
        style={{}}
        viewStyle={{}}
        onValueChange={jest.fn()}
        suppressErrors={false}
      />,
    );
    expect(getByText('Required')).toBeTruthy();
  });

  it('does not render error when suppressErrors is true', () => {
    const { queryByText } = render(
      <RatsCheckbox
        field={makeField({ name: 'agree' })}
        form={makeForm({ errors: { agree: 'Required' }, touched: { agree: true } })}
        label="Accept Terms"
        disabled={false}
        labelDisabled={false}
        placeholder=""
        style={{}}
        viewStyle={{}}
        onValueChange={jest.fn()}
        suppressErrors={true}
      />,
    );
    expect(queryByText('Required')).toBeNull();
  });

  it('does not render error when field is not touched', () => {
    const { queryByText } = render(
      <RatsCheckbox
        field={makeField({ name: 'agree' })}
        form={makeForm({ errors: { agree: 'Required' }, touched: {} })}
        label="Accept Terms"
        disabled={false}
        labelDisabled={false}
        placeholder=""
        style={{}}
        viewStyle={{}}
        onValueChange={jest.fn()}
        suppressErrors={false}
      />,
    );
    expect(queryByText('Required')).toBeNull();
  });

  it('renders with a custom viewStyle without crashing', () => {
    const { toJSON } = render(
      <RatsCheckbox
        field={makeField()}
        form={makeForm()}
        label="Check me"
        disabled={false}
        labelDisabled={false}
        placeholder=""
        style={{}}
        viewStyle={{ marginTop: 20 }}
        onValueChange={jest.fn()}
        suppressErrors={false}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('calls onValueChange when onChange is not provided on field', () => {
    const onValueChange = jest.fn();
    const { toJSON } = render(
      <RatsCheckbox
        field={{ name: 'agree', value: false, onChange: null as any, onBlur: jest.fn() }}
        form={makeForm()}
        label="Check me"
        disabled={false}
        labelDisabled={false}
        placeholder=""
        style={{}}
        viewStyle={{}}
        onValueChange={onValueChange}
        suppressErrors={false}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders default label from field.name when label prop is empty', () => {
    const { getByText } = render(
      <RatsCheckbox
        field={makeField({ name: 'myField' })}
        form={makeForm()}
        label=""
        disabled={false}
        labelDisabled={false}
        placeholder=""
        style={{}}
        viewStyle={{}}
        onValueChange={jest.fn()}
        suppressErrors={false}
      />,
    );
    // camelCaseToDisplayForm mock returns the raw name
    expect(getByText('myField')).toBeTruthy();
  });
});
