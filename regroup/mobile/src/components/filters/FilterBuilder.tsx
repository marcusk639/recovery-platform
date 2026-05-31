import React, { Fragment } from 'react';
import { Field } from 'formik';
import { View } from 'react-native';
import RatsPicker from '../rats-picker/rats-picker';
import { getPickerItems } from '../../util/display';
import FilterForm, { FilterFormProps } from '../../forms/FilterForm';

/**
 * Unified filter field configuration
 */
export interface FilterFieldConfig {
  name: string;
  label: string;
  type: 'picker' | 'custom';
  items?: any; // Direct items object or data source
  itemsConfig?: {
    // Configuration for getPickerItems
    includeAll?: boolean;
    labelFields?: string[];
  };
  // For custom fields
  customRender?: (fieldConfig: FilterFieldConfig) => JSX.Element;
}

/**
 * Filter builder configuration
 */
export interface FilterBuilderConfig<T = any> {
  fields: FilterFieldConfig[];
  defaultValues: T;
  filterValues: T;
  onReset?: () => void; // Optional custom reset handler
}

/**
 * Props for FilterBuilder component
 */
interface FilterBuilderProps extends FilterFormProps {
  config: FilterBuilderConfig;
  [key: string]: any; // Allow additional props like 'guests'
}

/**
 * Unified FilterBuilder Component
 *
 * Replaces duplicate filter forms with a configuration-based approach.
 *
 * Usage:
 * ```tsx
 * const config: FilterBuilderConfig<ActivityFilterValues> = {
 *   fields: [
 *     { name: 'type', label: 'Type', type: 'picker', items: {...}, itemsConfig: { includeAll: true } },
 *     { name: 'guest', label: 'Guests', type: 'picker', items: guests, itemsConfig: { labelFields: ['firstName', 'lastName'] } }
 *   ],
 *   defaultValues: new ActivityFilterValues(),
 *   filterValues: props.filters
 * };
 *
 * return <FilterBuilder config={config} {...props} />;
 * ```
 */
export const FilterBuilder: React.FC<FilterBuilderProps> = (props) => {
  const { config, ...restProps } = props;

  const renderField = (field: JSX.Element) => {
    return <View style={{}}>{field}</View>;
  };

  const renderFields = () => {
    return (
      <Fragment>
        {config.fields.map((fieldConfig, index) => {
          const { name, label, type, items, itemsConfig = {}, customRender } = fieldConfig;

          // Custom field rendering
          if (type === 'custom' && customRender) {
            return <Fragment key={`${name}-${index}`}>{customRender(fieldConfig)}</Fragment>;
          }

          // Standard picker field
          const pickerItems = getPickerItems(
            items,
            undefined,
            itemsConfig.includeAll || false,
            itemsConfig.labelFields || undefined
          );

          return renderField(
            <Field
              key={`${name}-${index}`}
              component={RatsPicker}
              name={name}
              label={label}
              items={pickerItems}
            />
          );
        })}
      </Fragment>
    );
  };

  const fields = renderFields();

  return React.createElement(
    FilterForm(
      config.filterValues,
      fields,
      restProps,
      config.defaultValues,
      config.onReset // Pass optional onReset handler
    )
  );
};

export default FilterBuilder;
