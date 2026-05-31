import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FilterBuilder, FilterBuilderConfig } from '../FilterBuilder';

jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcon');
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({}),
}));

// Mock heavy RatsPicker used inside Field
jest.mock('../../rats-picker/rats-picker', () => {
  const { View, Text } = require('react-native');
  return (props: any) => (
    <View testID={`picker-${props.field?.name || 'unknown'}`}>
      <Text>{props.label}</Text>
    </View>
  );
});

// Mock the ScreenHeader and related screen-header component
jest.mock('../../screen-header', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ header, children }: any) => (
      <View>
        <Text>{header}</Text>
        {children}
      </View>
    ),
  };
});

// Mock rats-scroll-view
jest.mock('../../rats-scroll-view', () => {
  const { ScrollView } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, ...rest }: any) => <ScrollView {...rest}>{children}</ScrollView>,
  };
});

// Formik Field mock — renders a simple component so we can test field rendering
jest.mock('formik', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    ...jest.requireActual('formik'),
    Field: ({ component: Component, name, label, items, ...rest }: any) => {
      const field = { name, value: '', onChange: jest.fn(), onBlur: jest.fn() };
      return <Component field={field} form={{}} label={label} items={items} {...rest} />;
    },
    withFormik: (options: any) => (WrappedComponent: any) => {
      return (props: any) => {
        const formikProps = {
          values: options.mapPropsToValues ? options.mapPropsToValues(props) : {},
          handleSubmit: jest.fn(async () => {
            if (options.handleSubmit) {
              await options.handleSubmit(
                options.mapPropsToValues ? options.mapPropsToValues(props) : {},
                { props },
              );
            }
          }),
          resetForm: jest.fn(),
          setFieldValue: jest.fn(),
          errors: {},
          touched: {},
          isSubmitting: false,
        };
        return React.createElement(WrappedComponent, { ...props, ...formikProps });
      };
    },
  };
});

// ─── Test data ───────────────────────────────────────────────────────────────

const ACTIVITY_TYPE_ITEMS = {
  meeting: 'Meeting',
  chore: 'Chore',
  medication: 'Medication',
};

interface TestFilterValues {
  type: string;
}

const defaultValues: TestFilterValues = { type: '' };

const makeConfig = (overrides: Partial<FilterBuilderConfig> = {}): FilterBuilderConfig => ({
  fields: [
    {
      name: 'type',
      label: 'Activity Type',
      type: 'picker',
      items: ACTIVITY_TYPE_ITEMS,
      itemsConfig: { includeAll: false },
    },
  ],
  defaultValues,
  filterValues: defaultValues,
  ...overrides,
});

const defaultOuterProps = {
  dismissModal: jest.fn(),
  setSearchFilters: jest.fn(),
  filters: defaultValues,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FilterBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(
      <FilterBuilder config={makeConfig()} {...defaultOuterProps} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders the Filter By header', () => {
    const { getByText } = render(
      <FilterBuilder config={makeConfig()} {...defaultOuterProps} />,
    );
    expect(getByText('Filter By')).toBeTruthy();
  });

  it('renders a picker field for a picker-type field config', () => {
    const { getByTestId } = render(
      <FilterBuilder config={makeConfig()} {...defaultOuterProps} />,
    );
    expect(getByTestId('picker-type')).toBeTruthy();
  });

  it('renders the field label', () => {
    const { getByText } = render(
      <FilterBuilder config={makeConfig()} {...defaultOuterProps} />,
    );
    expect(getByText('Activity Type')).toBeTruthy();
  });

  it('renders multiple picker fields from config', () => {
    const config = makeConfig({
      fields: [
        {
          name: 'type',
          label: 'Type',
          type: 'picker',
          items: ACTIVITY_TYPE_ITEMS,
        },
        {
          name: 'status',
          label: 'Status',
          type: 'picker',
          items: { active: 'Active', inactive: 'Inactive' },
        },
      ],
    });
    const { getByTestId, getByText } = render(
      <FilterBuilder config={config} {...defaultOuterProps} />,
    );
    expect(getByTestId('picker-type')).toBeTruthy();
    expect(getByTestId('picker-status')).toBeTruthy();
    expect(getByText('Type')).toBeTruthy();
    expect(getByText('Status')).toBeTruthy();
  });

  it('renders a custom field when type is "custom" with customRender', () => {
    const { View, Text } = require('react-native');
    const config = makeConfig({
      fields: [
        {
          name: 'custom',
          label: 'Custom Field',
          type: 'custom',
          customRender: () => (
            <View>
              <Text testID="custom-field">Custom</Text>
            </View>
          ),
        },
      ],
    });
    const { getByTestId } = render(
      <FilterBuilder config={config} {...defaultOuterProps} />,
    );
    expect(getByTestId('custom-field')).toBeTruthy();
  });

  it('renders APPLY and CANCEL confirmation buttons', () => {
    const { getByText } = render(
      <FilterBuilder config={makeConfig()} {...defaultOuterProps} />,
    );
    expect(getByText('APPLY')).toBeTruthy();
    expect(getByText('CANCEL')).toBeTruthy();
  });

  it('calls dismissModal when CANCEL is pressed', () => {
    const dismissModal = jest.fn();
    const { getByText } = render(
      <FilterBuilder
        config={makeConfig()}
        {...defaultOuterProps}
        dismissModal={dismissModal}
      />,
    );
    fireEvent.press(getByText('CANCEL'));
    expect(dismissModal).toHaveBeenCalledTimes(1);
  });

  it('renders CLEAR ALL button', () => {
    const { getByText } = render(
      <FilterBuilder config={makeConfig()} {...defaultOuterProps} />,
    );
    expect(getByText('CLEAR ALL')).toBeTruthy();
  });

  it('renders with an empty fields array without crashing', () => {
    const config = makeConfig({ fields: [] });
    const { toJSON } = render(
      <FilterBuilder config={config} {...defaultOuterProps} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('calls setSearchFilters with filter values when APPLY is pressed', () => {
    const setSearchFilters = jest.fn();
    const dismissModal = jest.fn();
    const { getByText } = render(
      <FilterBuilder
        config={makeConfig()}
        dismissModal={dismissModal}
        setSearchFilters={setSearchFilters}
        filters={defaultValues}
      />,
    );
    fireEvent.press(getByText('APPLY'));
    expect(setSearchFilters).toHaveBeenCalledWith(defaultValues);
  });
});
