import { useState, useCallback } from 'react';
import { Activity, ActivityType } from '../entities/ActivityModel';
import { Guest } from '../entities/Guest';
import { filterActivities } from '../util/guest';
import { ActivityFilterFormValues } from '../screens/Activity/ActivityFilterForm';

export interface UseActivityFiltersReturn {
  searchTerm: string;
  filters: ActivityFilterFormValues;
  setSearchTerm: (term: string) => void;
  setSearchFilters: (filters: ActivityFilterFormValues) => void;
  filterActivitiesByType: (
    type: ActivityType | 'all',
    disputesOnly?: boolean,
  ) => Activity[];
}

export function useActivityFilters(
  activities: Activity[],
  guest?: Guest,
): UseActivityFiltersReturn {
  const [searchTerm, setSearchTermState] = useState('');
  const [filters, setFilters] = useState<ActivityFilterFormValues>(
    new ActivityFilterFormValues(),
  );

  const setSearchTerm = useCallback((term: string): void => {
    setSearchTermState(term);
  }, []);

  const setSearchFilters = useCallback(
    (newFilters: ActivityFilterFormValues): void => {
      setFilters(newFilters);
    },
    [],
  );

  const filterActivitiesByType = useCallback(
    (type: ActivityType | 'all', disputesOnly: boolean = false): Activity[] => {
      const filtered = filterActivities(
        activities,
        filters,
        guest,
        searchTerm,
        type,
        disputesOnly,
      );
      filtered.sort(
        (left, right) =>
          new Date(right.timestamp).getTime() -
          new Date(left.timestamp).getTime(),
      );
      return filtered;
    },
    [activities, filters, guest, searchTerm],
  );

  return {
    searchTerm,
    filters,
    setSearchTerm,
    setSearchFilters,
    filterActivitiesByType,
  };
}
