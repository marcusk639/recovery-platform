/**
 * useMeetingSearch - Custom hook for meeting search logic
 *
 * Phase 4.1: Extracted from MeetingSearch.tsx (793 LOC)
 * Contains all business logic: search, filters, location, check-in
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Alert } from 'react-native';
import { useAppSelector } from '../../../state/store';
import { useSelectedHouse } from '../../../hooks/useSelectedHouse';
import { useSelectedGuest } from '../../../hooks/useSelectedGuest';
import { useModal, useNotification } from '../../../context';
import {
  MeetingSearchInput,
  RatsMeeting,
  Location,
} from '../../../entities/Meeting';
import { MeetingFilters } from '../MeetingFilterForm';
import { checkAndRequestLocationPermissions } from '../../../util/permissions';
import { logException } from '../../../util/logging';
import { getCurrentPosition } from '../../../util/geolocation';
import {
  getDayOfWeek,
  getTodaysDate,
  getMilitaryTime,
} from '../../../util/display';
import { getCheckinInput, getMeetingTime } from '../../../util/meeting';
import { useActivities } from '../../../hooks/activity';
import { ActivityType, ActivityStatus } from '../../../entities/ActivityModel';
import {
  useSearchMeetings,
  useCheckIntoMeeting,
} from '../../../state/queries/meetingQueries';

export interface UseMeetingSearchProps {
  navigation: any;
}

export const useMeetingSearch = (props: UseMeetingSearchProps) => {
  const { navigation } = props;

  // React Query mutations
  const searchMeetingsMutation = useSearchMeetings();
  const checkIntoMeetingMutation = useCheckIntoMeeting();

  const meetings: RatsMeeting[] = (searchMeetingsMutation.data as any) ?? [];
  const searchingForMeetings = searchMeetingsMutation.isPending;
  const checkingIn = checkIntoMeetingMutation.isPending;
  const checkInSuccessful = checkIntoMeetingMutation.isSuccess;
  const checkInError = (checkIntoMeetingMutation.error as Error)?.message ?? '';

  // Context hooks
  const { showFormModal, dismissFormModal } = useModal();
  const { notify, showPopover } = useNotification();

  // Redux state
  const { guest } = useSelectedGuest();
  const userAsGuest = useAppSelector(state => state.guests.userAsGuest);
  const { house } = useSelectedHouse();
  const user = useAppSelector(state => state.user.user);

  // Today's date for dedup checks
  const todaysDate = useMemo(() => getTodaysDate(), []);

  // Fetch today's meeting activities from Activity system for dedup checks
  const { activities: todaysMeetingActivities } = useActivities({
    guestId: guest?.id,
    houseId: house?.id,
    startDate: todaysDate,
    endDate: todaysDate,
    type: ActivityType.MEETING,
    status: ActivityStatus.ACTIVE,
  });

  // Local state
  const [searchTerm, setSearchTermState] = useState('');
  const [filters, setFiltersState] = useState<MeetingFilters>(
    new MeetingFilters(),
  );
  const [gettingPermissions, setGettingPermissions] = useState(true);
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [showForceModal, setShowForceModal] = useState(false);
  const [previousMeeting, setPreviousMeeting] = useState<RatsMeeting | null>(
    null,
  );

  const hasPermissionRef = useRef<boolean>(false);

  // Check if meetings already exist
  const alreadyHasMeetings = useCallback(() => {
    return meetings && meetings.length;
  }, [meetings]);

  // Initialize location on mount
  useEffect(() => {
    const initializeLocation = async () => {
      hasPermissionRef.current =
        (await checkAndRequestLocationPermissions()) as boolean;
      if (hasPermissionRef.current && !alreadyHasMeetings()) {
        getCurrentPosition(
          (position: any) => {
            const location = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            setFiltersState(prevState => ({ ...prevState, location }));
            setUserLocation(location);
          },
          err => {
            logException(err);
          },
        );
      }
      setGettingPermissions(false);
    };

    initializeLocation();
  }, [alreadyHasMeetings]);

  // Execute search when filters change (with location)
  useEffect(() => {
    // Only search if we have a location set
    if (filters.location) {
      searchMeetingsMutation.mutate({
        location: filters.location,
        filters,
        criteria:
          searchTerm.length > 0 ? { name: searchTerm.trim() } : undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, searchTerm]);

  // Search term setter
  const setSearchTerm = useCallback((text: string) => {
    setSearchTermState(text);
  }, []);

  // Build search input
  const getSearchInput = useCallback((): MeetingSearchInput => {
    const location = filters.location ?? {};
    if (searchTerm.length === 0) {
      return { location, filters };
    }
    return {
      location,
      filters,
      criteria: { name: searchTerm.trim() },
    };
  }, [searchTerm, filters]);

  // Execute search
  const executeSearch = useCallback(() => {
    searchMeetingsMutation.mutate(getSearchInput());
  }, [searchMeetingsMutation, getSearchInput]);

  // Update search filters
  const setSearchFilters = useCallback((newFilters: MeetingFilters) => {
    setFiltersState(newFilters);
  }, []);

  // Set location filter
  const setLocation = useCallback((location: Location) => {
    setFiltersState(prevState => ({
      ...prevState,
      location,
    }));
  }, []);

  // Check if guest already attended meeting today
  const guestAttendedMeeting = useCallback(
    (meeting: RatsMeeting) => {
      return todaysMeetingActivities.some(activity => {
        const data = activity.data as any;
        return data?.meetingId === meeting.id;
      });
    },
    [todaysMeetingActivities],
  );

  // Check if it's the right day for meeting
  const isMeetingDay = useCallback((meeting: RatsMeeting) => {
    const today = (getDayOfWeek(getTodaysDate(), true) as string).toLowerCase();
    const meetingDay = meeting.day?.toLowerCase();
    return (
      meetingDay === today ||
      meetingDay === 'all' ||
      meetingDay === 'daily' ||
      !meetingDay // If no specific day, assume it's valid
    );
  }, []);

  // Check if it's the right time for meeting
  const isMeetingTime = useCallback((meetingTime: string) => {
    const now = new Date();
    const currentTime = getMilitaryTime(now.getHours(), now.getMinutes());
    const currentHour = parseInt(currentTime.split(':')[0]);
    const meetingBeginHour = parseInt(meetingTime.split(':')[0]);
    return currentHour === meetingBeginHour;
  }, []);

  // Perform the actual check-in
  const performCheckIn = useCallback(
    (meeting: RatsMeeting) => {
      const checkinInput = getCheckinInput(meeting, userLocation);
      const guestId = (userAsGuest || guest)?.id ?? '';
      const houseId = house?.id ?? '';
      const userId = user?.id ?? '';
      checkIntoMeetingMutation.mutate({
        checkInInput: checkinInput,
        meeting,
        guestId,
        houseId,
        userId,
      });
    },
    [userLocation, userAsGuest, guest, house, user, checkIntoMeetingMutation],
  );

  // Check into meeting
  const checkInto = useCallback(
    (meeting: RatsMeeting) => {
      const attended = guestAttendedMeeting(meeting);
      if (attended) {
        notify(
          'Already Checked In',
          'You have already checked into this meeting today',
          [],
        );
        return;
      }

      const meetingDay = isMeetingDay(meeting);
      const meetingTimeValue = getMeetingTime(meeting);
      const rightTime = isMeetingTime(meetingTimeValue || '');

      if (!meetingDay || !rightTime) {
        // Show confirmation alert for checking in outside normal meeting time
        Alert.alert(
          'Confirm Check-In',
          'This meeting may not be happening right now. Are you sure you want to check in?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Check In Anyway',
              onPress: () => performCheckIn(meeting),
              style: 'default',
            },
          ],
        );
        return;
      }

      performCheckIn(meeting);
    },
    [guestAttendedMeeting, isMeetingDay, isMeetingTime, performCheckIn, notify],
  );

  // Force check-in (when not right day/time) - kept for backwards compatibility
  const forceCheckIn = useCallback(() => {
    if (previousMeeting) {
      performCheckIn(previousMeeting);
      setShowForceModal(false);
      setPreviousMeeting(null);
    }
  }, [previousMeeting, performCheckIn]);

  // Dismiss force modal
  const dismissForceModal = useCallback(() => {
    setShowForceModal(false);
    setPreviousMeeting(null);
  }, []);

  // Check if no meetings found
  const noMeetingsFound = useCallback(() => {
    return !gettingPermissions && !meetings?.length;
  }, [gettingPermissions, meetings]);

  return {
    // State
    searchTerm,
    filters,
    meetings,
    searchingForMeetings,
    checkingIn,
    checkInSuccessful,
    checkInError,
    userLocation,
    gettingPermissions,
    showForceModal,
    previousMeeting,
    guest,
    userAsGuest,

    // Actions
    setSearchTerm,
    executeSearch,
    setSearchFilters,
    setLocation,
    checkInto,
    forceCheckIn,
    dismissForceModal,
    noMeetingsFound,
    guestAttendedMeeting,
    isMeetingDay,
    isMeetingTime,

    // Context
    showFormModal,
    dismissFormModal,
    notify,
    showPopover,
    navigation,
  };
};
