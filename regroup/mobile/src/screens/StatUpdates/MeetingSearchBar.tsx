import React from 'react';
import { CARD_STYLE, normalize } from '../../styles/theme';
import RatsSearchBar from '../../components/rats-search-bar';
import { MeetingFilters } from './MeetingFilterForm';
import { Location } from '../../entities/Meeting';

export interface MeetingSearchBarProps {
  filters: MeetingFilters;
  onChangeText: (text: string) => void;
  setLocation: (location: Location) => void;
  onFilter: () => void;
}

const MeetingSearchBar: React.FC<MeetingSearchBarProps> = ({
  filters,
  onChangeText,
  setLocation,
  onFilter,
}) => {
  const locationFilter =
    filters.location && filters.location.city && filters.location.state
      ? filters.location.city + ', ' + filters.location.state
      : null;

  return (
    <RatsSearchBar
      container={{ ...CARD_STYLE, paddingVertical: normalize(0) }}
      address
      showCurrentLocation
      value={locationFilter as string}
      onChangeText={onChangeText}
      setLocation={setLocation}
      onFilter={onFilter}
      placeholder="Search meeting name or hour..."
    />
  );
};

export default MeetingSearchBar;
