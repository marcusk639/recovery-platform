import React from 'react';
import { Guests } from '../../types';
import { Guest } from '../../entities/Guest';
import { FilterFormProps } from '../../forms/FilterForm';
import FilterBuilder, { FilterBuilderConfig } from '../../components/filters/FilterBuilder';

interface Props extends FilterFormProps {
  guests: Guests;
  filters: ComplaintFilterFormValues;
}

export class ComplaintFilterFormValues {
  guest: Guest | null = null;
}

export const ComplaintsFilterForm = (props: Props) => {
  const config: FilterBuilderConfig<ComplaintFilterFormValues> = {
    fields: [
      {
        name: 'guest',
        label: 'Guests',
        type: 'picker',
        items: props.guests,
        itemsConfig: { labelFields: ['firstName', 'lastName'] },
      },
    ],
    defaultValues: new ComplaintFilterFormValues(),
    filterValues: props.filters,
  };

  return <FilterBuilder config={config} {...props} />;
};
