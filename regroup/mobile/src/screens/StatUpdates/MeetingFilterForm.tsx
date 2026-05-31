import React from 'react';
import { getDayOfWeek, getTodaysDate } from '../../util/display';
import { FilterFormProps } from '../../forms/FilterForm';
import FilterBuilder, { FilterBuilderConfig } from '../../components/filters/FilterBuilder';
import { Location, meetingTypeItems } from '../../entities/Meeting';
import { WeekDay } from './MeetingSearch';
import { daysOfWeek } from '../../components/weekdays';

interface Props extends FilterFormProps {
  filters: MeetingFilters;
}

export type MeetingTypeFilters =
  | 'AA'
  | 'NA'
  | 'AL-ANON'
  | 'IOP'
  | 'Celebrate Recovery'
  | 'Custom'
  | 'all';

const weekdayItems: Record<string, string> = {};
daysOfWeek.forEach(day => {
  weekdayItems[day.charAt(0).toUpperCase() + day.substring(1, day.length)] =
    day;
});

export class MeetingFilters {
  day: WeekDay = daysOfWeek[getDayOfWeek(getTodaysDate())].toLowerCase() as WeekDay;
  location?: Location;
  type: MeetingTypeFilters = 'all';
}

const MeetingFilterFormComponent = (props: Props) => {
  const config: FilterBuilderConfig<MeetingFilters> = {
    fields: [
      {
        name: 'type',
        label: 'Type',
        type: 'picker',
        items: meetingTypeItems,
        itemsConfig: { includeAll: true },
      },
      {
        name: 'day',
        label: 'Day',
        type: 'picker',
        items: weekdayItems,
        itemsConfig: { includeAll: true },
      },
    ],
    defaultValues: new MeetingFilters(),
    filterValues: props.filters,
  };

  return <FilterBuilder config={config} {...props} />;
};

export const MeetingFilterForm = MeetingFilterFormComponent;
export default MeetingFilterFormComponent;
