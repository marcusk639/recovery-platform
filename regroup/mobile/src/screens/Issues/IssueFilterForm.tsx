import React from 'react';
import { Guests } from '../../types';
import { Guest } from '../../entities/Guest';
import { FilterFormProps } from '../../forms/FilterForm';
import FilterBuilder, { FilterBuilderConfig } from '../../components/filters/FilterBuilder';
import { IssueStatus } from '../../entities/Issue';

interface Props extends FilterFormProps {
  guests: Guests;
  filters: IssueFilterFormValues;
}

export type IssueTypeFilters = 'house' | 'guest' | 'maintenance' | 'all';
export type IssueStatusFilter = IssueStatus | 'all';

export class IssueFilterFormValues {
  guest: Guest | null = null;
  type: IssueTypeFilters = 'all';
  status: IssueStatusFilter = 'all';
}

const issueTypeItems = {
  Guest: 'guest',
  House: 'house',
  All: 'all',
  Maintenance: 'maintenance',
};

const issueStatusItems = {
  All: 'all',
  Open: IssueStatus.OPEN,
  'In Progress': IssueStatus.IN_PROGRESS,
  Resolved: IssueStatus.RESOLVED,
  Dismissed: IssueStatus.DISMISSED,
};

export const IssueFilterForm = (props: Props) => {
  const config: FilterBuilderConfig<IssueFilterFormValues> = {
    fields: [
      {
        name: 'status',
        label: 'Status',
        type: 'picker',
        items: issueStatusItems,
        itemsConfig: { includeAll: true },
      },
      {
        name: 'type',
        label: 'Type',
        type: 'picker',
        items: issueTypeItems,
        itemsConfig: { includeAll: true },
      },
      {
        name: 'guest',
        label: 'Guests',
        type: 'picker',
        items: props.guests,
        itemsConfig: { labelFields: ['firstName', 'lastName'] },
      },
    ],
    defaultValues: new IssueFilterFormValues(),
    filterValues: props.filters,
  };

  return <FilterBuilder config={config} {...props} />;
};
