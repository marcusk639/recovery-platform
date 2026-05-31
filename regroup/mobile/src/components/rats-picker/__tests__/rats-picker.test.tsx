/**
 * Tests for RatsPicker component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { RatsPicker } from '../index';

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

jest.mock('react-native-vector-icons/Ionicons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Ionicons = (props: any) => <View testID={`ionicon-${props.name}`} {...props} />;
  return Ionicons;
});

// Mock react-native-picker-select
jest.mock('react-native-picker-select', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  const Picker = React.forwardRef((props: any, ref: any) => {
    // Expose setState on ref to match onDonePress usage in the component
    React.useImperativeHandle(ref, () => ({
      setState: jest.fn(),
    }));
    return (
      <View testID="picker-select">
        {(props.items || []).map((item: any) => (
          <TouchableOpacity
            key={item.key || item.value}
            testID={`picker-item-${item.value}`}
            onPress={() => props.onValueChange && props.onValueChange(item.value, 0)}>
            <Text>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  });
  Picker.displayName = 'MockRNPickerSelect';
  return Picker;
});

const defaultField = { name: 'category', value: undefined, onBlur: jest.fn() };
const defaultForm = { errors: {}, touched: {}, setFieldValue: jest.fn() };

const pickerItems = { option_a: 'A', option_b: 'B', option_c: 'C' };

describe('RatsPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing with defaults', () => {
    const { toJSON } = render(
      <RatsPicker
        field={defaultField}
        form={defaultForm}
        pickerItems={pickerItems}
        getPickerItems={(items) =>
          Object.keys(items).map((k) => ({ key: k, label: k, value: items[k] }))
        }
        label="Category"
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders the label when labelDisabled is false (default)', () => {
    const { getByText } = render(
      <RatsPicker
        field={defaultField}
        form={defaultForm}
        pickerItems={pickerItems}
        getPickerItems={(items) =>
          Object.keys(items).map((k) => ({ key: k, label: k, value: items[k] }))
        }
        label="Select Category"
      />,
    );
    expect(getByText('Select Category')).toBeTruthy();
  });

  it('does not render the label when labelDisabled is true', () => {
    const { queryByText } = render(
      <RatsPicker
        field={defaultField}
        form={defaultForm}
        pickerItems={pickerItems}
        getPickerItems={(items) =>
          Object.keys(items).map((k) => ({ key: k, label: k, value: items[k] }))
        }
        label="Hidden Label"
        labelDisabled
      />,
    );
    expect(queryByText('Hidden Label')).toBeNull();
  });

  it('renders picker items via getPickerItems', () => {
    const { getByText } = render(
      <RatsPicker
        field={defaultField}
        form={defaultForm}
        pickerItems={pickerItems}
        getPickerItems={(items) =>
          Object.keys(items).map((k) => ({ key: k, label: k, value: items[k] }))
        }
        label="Category"
      />,
    );
    expect(getByText('option_a')).toBeTruthy();
    expect(getByText('option_b')).toBeTruthy();
    expect(getByText('option_c')).toBeTruthy();
  });

  it('renders with a pre-selected value without crashing', () => {
    const { toJSON } = render(
      <RatsPicker
        field={{ ...defaultField, value: 'A' }}
        form={defaultForm}
        pickerItems={pickerItems}
        getPickerItems={(items) =>
          Object.keys(items).map((k) => ({ key: k, label: k, value: items[k] }))
        }
        label="Category"
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('calls handleValueChange when a value is selected', () => {
    const handleValueChange = jest.fn();
    const { getByTestId } = render(
      <RatsPicker
        field={defaultField}
        form={defaultForm}
        pickerItems={pickerItems}
        getPickerItems={(items) =>
          Object.keys(items).map((k) => ({ key: k, label: k, value: items[k] }))
        }
        label="Category"
        handleValueChange={handleValueChange}
      />,
    );
    const { fireEvent } = require('@testing-library/react-native');
    fireEvent.press(getByTestId('picker-item-A'));
    expect(handleValueChange).toHaveBeenCalledWith('A');
  });

  it('calls form.setFieldValue when no handleValueChange and a value is selected', () => {
    const setFieldValue = jest.fn();
    const { getByTestId } = render(
      <RatsPicker
        field={defaultField}
        form={{ ...defaultForm, setFieldValue }}
        pickerItems={pickerItems}
        getPickerItems={(items) =>
          Object.keys(items).map((k) => ({ key: k, label: k, value: items[k] }))
        }
        label="Category"
      />,
    );
    const { fireEvent } = require('@testing-library/react-native');
    fireEvent.press(getByTestId('picker-item-A'));
    expect(setFieldValue).toHaveBeenCalledWith('category', 'A');
  });

  it('renders with custom items array directly', () => {
    const items = [
      { key: 'x', label: 'Option X', value: 'x' },
      { key: 'y', label: 'Option Y', value: 'y' },
    ];
    const { getByText } = render(
      <RatsPicker
        field={defaultField}
        form={defaultForm}
        pickerItems={{}}
        getPickerItems={() => []}
        items={items}
        label="Direct Items"
      />,
    );
    expect(getByText('Option X')).toBeTruthy();
    expect(getByText('Option Y')).toBeTruthy();
  });

  it('renders error label when field has an error and is touched', () => {
    const { getByText } = render(
      <RatsPicker
        field={{ ...defaultField, name: 'category' }}
        form={{
          errors: { category: 'Required field' },
          touched: { category: true },
          setFieldValue: jest.fn(),
        }}
        pickerItems={pickerItems}
        getPickerItems={(items) =>
          Object.keys(items).map((k) => ({ key: k, label: k, value: items[k] }))
        }
        label="Category"
      />,
    );
    expect(getByText('Required field')).toBeTruthy();
  });

  it('does not render error when field is not touched', () => {
    const { queryByText } = render(
      <RatsPicker
        field={{ ...defaultField, name: 'category' }}
        form={{
          errors: { category: 'Required field' },
          touched: { category: false },
          setFieldValue: jest.fn(),
        }}
        pickerItems={pickerItems}
        getPickerItems={(items) =>
          Object.keys(items).map((k) => ({ key: k, label: k, value: items[k] }))
        }
        label="Category"
      />,
    );
    expect(queryByText('Required field')).toBeNull();
  });

  it('renders with custom containerStyle without crashing', () => {
    const { toJSON } = render(
      <RatsPicker
        field={defaultField}
        form={defaultForm}
        pickerItems={pickerItems}
        getPickerItems={(items) =>
          Object.keys(items).map((k) => ({ key: k, label: k, value: items[k] }))
        }
        label="Category"
        containerStyle={{ margin: 20 }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });
});
