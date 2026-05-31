// Phase 3.3: Migrated from 5 HOC layers to Context hooks
// Phase 4.1: Extracted business logic to useMeetingSearch hook
// Phase 4.2: Completed RTK migration - component now uses Redux hooks directly
// Phase 4.3: Extracted MeetingSearchBar and MeetingResultsList into standalone files
// Phase 4.4: Migrated searchForMeetings/checkIntoMeeting from Redux thunks to React Query
// Removed: withRats, withLoadingModal, withFormModal, withNotifier, withPopover
import React, { useCallback } from 'react';
import { useMeetingSearch } from './MeetingSearch/useMeetingSearch';
import { useNotification } from '../../context';
import { color } from '../../styles/theme';
import { View } from 'react-native';

import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import ScreenHeader from '../../components/screen-header';
import { MeetingFilters, MeetingFilterForm } from './MeetingFilterForm';
import EmptyScreen from '../../components/empty-screen';
import HelpIcon from '../../components/help-icon';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import MeetingSearchBar from './MeetingSearchBar';
import MeetingResultsList from './MeetingResultsList';

// Re-export for backward compatibility with MeetingFilterForm and other callers
export type { WeekDay } from './MeetingSearch/types';
export { MEETING_DESCRIPTION_TEXT } from './MeetingSearch/types';

/**
 * Meeting Search Props
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * @migrated Phase 4.2 - Component now uses Redux hooks, only needs navigation
 * @migrated Phase 4.3 - Rendering extracted to MeetingSearchBar and MeetingResultsList
 */
interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * Meeting Search Screen
 *
 * Coordinator: delegates rendering to MeetingSearchBar and MeetingResultsList.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * @migrated Phase 3.3 - Removed HOCs, added Context hooks
 * @migrated Phase 4.2 - Completed RTK migration with Redux hooks
 * @migrated Phase 4.3 - Extracted sub-components for maintainability
 */
const MeetingSearch: React.FC<Props> = ({ navigation }) => {
  // Use custom hook for all business logic (mutations owned by hook)
  const meetingSearch = useMeetingSearch({ navigation });

  const {
    searchTerm,
    filters,
    meetings,
    userAsGuest,
    searchingForMeetings,
    checkingIn,
    checkInSuccessful,
    checkInError,
    setSearchTerm,
    setSearchFilters,
    checkInto,
    noMeetingsFound,
    guestAttendedMeeting,
    isMeetingDay,
    isMeetingTime,
    showFormModal,
    dismissFormModal,
    showPopover,
  } = meetingSearch;

  const { setPopoverRef } = useNotification();

  const openFilters = useCallback(() => {
    showFormModal(
      <MeetingFilterForm
        dismissModal={dismissFormModal}
        setSearchFilters={setSearchFilters}
        filters={filters}
      />,
    );
  }, [showFormModal, dismissFormModal, setSearchFilters, filters]);

  const renderHelp = useCallback(() => {
    showPopover(
      'MEETING SEARCH',
      'Here you can search for meetings in any area by selecting a search location in the filters. Residents can check into meetings here.',
    );
  }, [showPopover]);

  return (
    <View style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader
        renderBackButton
        container={{ marginBottom: 1 }}
        icon={<HelpIcon setRef={setPopoverRef} helpFn={renderHelp} />}
        header="Find Meetings"
      />
      <MeetingSearchBar
        filters={filters}
        onChangeText={setSearchTerm}
        setLocation={meetingSearch.setLocation}
        onFilter={openFilters}
      />
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: -50,
        }}>
        {!searchingForMeetings && noMeetingsFound() && (
          <EmptyScreen
            icon="folder-open"
            buttonTitle="CHANGE FILTERS"
            onPress={() => openFilters()}
            message="No meetings found. Try changing the search filters."
          />
        )}
        {searchingForMeetings && (
          <RatsLoadingIndicator
            containerStyle={{ backgroundColor: undefined }}
          />
        )}
        {!searchingForMeetings && !noMeetingsFound() && (
          <MeetingResultsList
            meetings={meetings}
            filters={filters}
            searchTerm={searchTerm}
            checkInto={checkInto}
            guestAttendedMeeting={guestAttendedMeeting}
            isMeetingDay={isMeetingDay}
            isMeetingTime={isMeetingTime}
            userAsGuest={userAsGuest}
          />
        )}
      </View>
    </View>
  );
};

export default MeetingSearch;
