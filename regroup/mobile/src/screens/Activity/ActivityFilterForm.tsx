import React from 'react';
import { Guests } from '../../types';
import { Guest } from '../../entities/Guest';
import { ActivityType } from '../../entities/ActivityModel';
import { FilterFormProps } from '../../forms/FilterForm';
import FilterBuilder, {
  FilterBuilderConfig,
} from '../../components/filters/FilterBuilder';

interface Props extends FilterFormProps {
  guests: Guests;
  filters: ActivityFilterFormValues;
}

export class ActivityFilterFormValues {
  disputed: 'yes' | 'no' | 'all' = 'all';
  guest: Guest | null = null;
  type: ActivityType | 'all' = 'all';
}

const activityTypeItems = {
  Meeting: ActivityType.MEETING,
  Medication: ActivityType.MEDICATION,
  Sponsor: ActivityType.PRIMARY_SUPPORTER,
  Work: ActivityType.WORK,
  Chore: ActivityType.CHORE,
  All: 'all',
};

const disputedItems = {
  Yes: 'yes',
  No: 'no',
  All: 'all',
};

export const ActivityFilterForm = (props: Props) => {
  const config: FilterBuilderConfig<ActivityFilterFormValues> = {
    fields: [
      {
        name: 'type',
        label: 'Type',
        type: 'picker',
        items: activityTypeItems,
        itemsConfig: { includeAll: true },
      },
      {
        name: 'guest',
        label: 'Guests',
        type: 'picker',
        items: props.guests,
        itemsConfig: { labelFields: ['firstName', 'lastName'] },
      },
      {
        name: 'disputed',
        label: 'Disputed',
        type: 'picker',
        items: disputedItems,
        itemsConfig: { includeAll: true },
      },
    ],
    defaultValues: new ActivityFilterFormValues(),
    filterValues: props.filters,
  };

  return <FilterBuilder config={config} {...props} />;
};
