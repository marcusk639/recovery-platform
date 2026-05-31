/**
 * Tests for RatsSwitch component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RatsSwitch } from '../index';

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
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

describe('RatsSwitch', () => {
  it('renders without crashing with no props', () => {
    const { toJSON } = render(<RatsSwitch />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders a label when label prop is provided', () => {
    const { getByText } = render(<RatsSwitch label="Enable Notifications" />);
    expect(getByText('Enable Notifications')).toBeTruthy();
  });

  it('does not render label text when labelDisabled is true', () => {
    const { queryByText } = render(
      <RatsSwitch label="Hidden Label" labelDisabled />,
    );
    expect(queryByText('Hidden Label')).toBeNull();
  });

  it('calls onValueChange when the switch is toggled', () => {
    const onValueChange = jest.fn();
    const { UNSAFE_getByType } = render(
      <RatsSwitch onValueChange={onValueChange} value={false} />,
    );
    const { Switch } = require('react-native');
    const switchEl = UNSAFE_getByType(Switch);
    fireEvent(switchEl, 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('renders with value=true (switch on)', () => {
    const { UNSAFE_getByType } = render(<RatsSwitch value={true} />);
    const { Switch } = require('react-native');
    const switchEl = UNSAFE_getByType(Switch);
    expect(switchEl.props.value).toBe(true);
  });

  it('renders with value=false (switch off) without crashing', () => {
    // The component uses `props.value || value` so false || undefined resolves
    // to undefined; the Switch renders without crashing and reports no value.
    const { UNSAFE_getByType } = render(<RatsSwitch value={false} />);
    const { Switch } = require('react-native');
    const switchEl = UNSAFE_getByType(Switch);
    // value is undefined because false || undefined === undefined
    expect(switchEl.props.value).toBeFalsy();
  });

  it('renders label on the left side by default', () => {
    const { toJSON } = render(<RatsSwitch label="Left Label" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders label on the right side when labelSide is right', () => {
    const { getByText } = render(
      <RatsSwitch label="Right Label" labelSide="right" />,
    );
    expect(getByText('Right Label')).toBeTruthy();
  });

  it('renders without crashing when using Formik field prop', () => {
    const mockField = { name: 'active', value: true, onChange: jest.fn(), onBlur: jest.fn() };
    const mockForm = {
      errors: {},
      touched: {},
      setFieldValue: jest.fn(),
    };
    const { toJSON } = render(
      <RatsSwitch
        label="Active"
        field={mockField}
        form={mockForm as any}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('calls setFieldValue via Formik form when toggled with field/form props', () => {
    const setFieldValue = jest.fn();
    const mockField = { name: 'active', value: false, onChange: jest.fn(), onBlur: jest.fn() };
    const mockForm = { errors: {}, touched: {}, setFieldValue };
    const { UNSAFE_getByType } = render(
      <RatsSwitch field={mockField} form={mockForm as any} />,
    );
    const { Switch } = require('react-native');
    const switchEl = UNSAFE_getByType(Switch);
    fireEvent(switchEl, 'valueChange', true);
    expect(setFieldValue).toHaveBeenCalledWith('active', true);
  });

  it('accepts custom containerStyle without crashing', () => {
    const { toJSON } = render(
      <RatsSwitch label="Styled" containerStyle={{ backgroundColor: '#eee' }} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom labelStyle without crashing', () => {
    const { getByText } = render(
      <RatsSwitch label="Styled Label" labelStyle={{ fontSize: 18 }} />,
    );
    expect(getByText('Styled Label')).toBeTruthy();
  });
});
