import React, { useCallback, useMemo, Fragment } from 'react';
import {
  color,
  normalize,
  fontSize,
  ROW,
  CARD_STYLE,
  fontFamily,
} from '../../styles/theme';
import {
  View,
  Dimensions,
  ListRenderItemInfo,
  Linking,
  Alert,
} from 'react-native';
import { MeetingType, RatsMeeting } from '../../entities/Meeting';
import { RatsIcon, ClickableIcon } from '../../components/rats-icon';
import { RatsText } from '../../components/rats-text';
import {
  militaryTimeToDate,
  getFormattedTime,
  militaryTimeToStandard,
} from '../../util/display';
import { RatsFlatList } from '../../components/rats-flat-list';
import { RatsImage } from '../../components/rats-image';
import { aaLogo, naLogo, crLogo } from '../../../assets';
import RatsButton from '../../components/rats-button/rats-button';
import { MeetingFilters } from './MeetingFilterForm';
import { MEETING_DESCRIPTION_TEXT } from './MeetingSearch/types';
import Clipboard from '@react-native-clipboard/clipboard';
import { Guest } from '../../entities/Guest';

export interface MeetingResultsListProps {
  meetings: RatsMeeting[];
  filters: MeetingFilters;
  searchTerm: string;
  checkInto: (meeting: RatsMeeting) => void;
  guestAttendedMeeting: (meeting: RatsMeeting) => boolean;
  isMeetingDay: (meeting: RatsMeeting) => boolean;
  isMeetingTime: (time: string) => boolean;
  userAsGuest: Guest | null | undefined;
}

const MeetingResultsList: React.FC<MeetingResultsListProps> = ({
  meetings,
  filters,
  searchTerm,
  checkInto,
  guestAttendedMeeting,
  isMeetingDay,
  isMeetingTime,
  userAsGuest,
}) => {
  const renderMeetingTime = useCallback((time: string) => {
    return (
      <RatsText
        translate={false}
        text={getFormattedTime(militaryTimeToDate(time))}
        style={{ fontSize: fontSize.regular, fontFamily: fontFamily.bold }}
      />
    );
  }, []);

  const renderCheckInButton = useCallback(
    (meeting: RatsMeeting) => {
      const meetingTime =
        meeting.time ||
        (meeting.daysAndTimes && filters.day !== 'all'
          ? meeting.daysAndTimes[filters.day as keyof typeof meeting.daysAndTimes]
          : undefined);
      const disabled =
        guestAttendedMeeting(meeting) ||
        !isMeetingDay(meeting) ||
        !isMeetingTime(meetingTime || '');
      return (
        <RatsButton
          testID="add-meeting-button"
          onPress={() => checkInto(meeting)}
          title="CHECK IN"
          containerStyle={{
            backgroundColor: color.white,
            borderColor: color.baby_blue,
            borderWidth: 1.5,
          }}
          style={{ color: color.baby_blue }}
          disabled={disabled}
        />
      );
    },
    [guestAttendedMeeting, isMeetingDay, isMeetingTime, filters, checkInto],
  );

  const renderMeetingImage = useCallback((meetingType: MeetingType) => {
    let source = null;
    if (meetingType === 'AA') {
      source = aaLogo;
    }
    if (meetingType === 'NA') {
      source = naLogo;
    }
    if (meetingType === 'Celebrate Recovery') {
      source = crLogo;
    }
    return (
      <Fragment>
        {source && (
          <RatsImage
            style={{ width: normalize(55), height: normalize(55) }}
            source={source}
          />
        )}
        {source === null && (
          <View style={{ justifyContent: 'center', alignItems: 'center' }}>
            <RatsIcon
              name="user-friends"
              size={normalize(35)}
              style={{ marginLeft: normalize(5) }}
            />
          </View>
        )}
      </Fragment>
    );
  }, []);

  const renderAAMeetingDescription = useCallback(
    (meeting: RatsMeeting) => {
      const meetingTime =
        meeting.time ||
        (meeting.daysAndTimes && filters.day !== 'all'
          ? meeting.daysAndTimes[filters.day as keyof typeof meeting.daysAndTimes]
          : undefined);
      return (
        <Fragment>
          {renderMeetingTime(meetingTime || '')}
          {!meeting.online && (
            <Fragment>
              <RatsText style={MEETING_DESCRIPTION_TEXT} text={meeting.street} />
              <RatsText
                style={MEETING_DESCRIPTION_TEXT}
                text={`${meeting.city}, ${meeting.state} ${meeting.zip}`}
              />
            </Fragment>
          )}
          {meeting.online && (
            <Fragment>
              <RatsText style={MEETING_DESCRIPTION_TEXT} text={meeting.link} />
              <RatsText
                style={MEETING_DESCRIPTION_TEXT}
                text={meeting.onlineNotes}
              />
            </Fragment>
          )}
          {meeting.locationName && (
            <RatsText
              style={MEETING_DESCRIPTION_TEXT}
              text={meeting.locationName}
            />
          )}
        </Fragment>
      );
    },
    [renderMeetingTime, filters],
  );

  const renderNAMeetingDescription = useCallback(
    (meeting: RatsMeeting) => {
      const meetingKey =
        meeting.name + meeting.Location?.toString() + meeting.time + meeting.day;
      return (
        <Fragment key={meetingKey}>
          {meeting.online && (
            <Fragment>
              {renderMeetingTime(meeting.time)}
              <RatsText
                style={MEETING_DESCRIPTION_TEXT}
                translate={false}
                text={meeting.link}
              />
              <RatsText
                style={MEETING_DESCRIPTION_TEXT}
                translate={false}
                text={meeting.onlineNotes}
              />
            </Fragment>
          )}
          {!meeting.online &&
            meeting.Location?.map((location, index) => {
              if (index === 0) {
                return (
                  <Fragment key={meetingKey}>
                    {renderMeetingTime(meeting.time)}
                  </Fragment>
                );
              }
              return (
                <RatsText
                  style={MEETING_DESCRIPTION_TEXT}
                  translate={false}
                  key={location}
                  text={location}
                />
              );
            })}
        </Fragment>
      );
    },
    [renderMeetingTime],
  );

  const renderMeetingHeading = useCallback((meeting: RatsMeeting) => {
    return (
      <View
        style={{
          justifyContent: 'center',
          flex: 1,
          marginLeft: normalize(10),
        }}>
        <RatsText
          text={meeting.name}
          style={{
            fontSize: fontSize.medium_large,
            fontFamily: fontFamily.bold,
          }}
        />
        <RatsText
          text={meeting.type + ' Meeting'}
          style={{ fontSize: fontSize.regular_medium, color: color.grey }}
        />
      </View>
    );
  }, []);

  const linkToDirections = useCallback(
    (meeting: RatsMeeting) => () => {
      const url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=${meeting.lat},${meeting.lng}`;
      Linking.canOpenURL(url)
        .then(supported => {
          if (!supported) {
            Alert.alert('Not supported on this device');
          } else {
            return Linking.openURL(url);
          }
        })
        .catch(_err => Alert.alert('Something went wrong'));
    },
    [],
  );

  const renderMeeting = useCallback(
    (meeting: RatsMeeting, index: number) => {
      const width = Dimensions.get('screen').width;
      return (
        <View
          key={index}
          style={[
            CARD_STYLE,
            {
              width,
              paddingVertical: normalize(15),
              paddingHorizontal: normalize(15),
            },
          ]}>
          <View style={[ROW]}>
            {renderMeetingImage(meeting.type)}
            {renderMeetingHeading(meeting)}
            {!meeting.online && (
              <View>
                <ClickableIcon
                  containerProps={{ onPress: linkToDirections(meeting) }}
                  iconProps={{
                    name: 'directions',
                    size: normalize(40),
                    style: { color: color.baby_blue, alignSelf: 'center' },
                  }}
                />
                <RatsText text="Directions" style={{ color: color.baby_blue }} />
              </View>
            )}
            {meeting.online && (
              <View>
                <ClickableIcon
                  containerProps={{
                    onPress: () => Clipboard.setString(meeting.link!),
                  }}
                  iconProps={{
                    name: 'clipboard',
                    size: normalize(40),
                    style: { color: color.baby_blue, alignSelf: 'center' },
                  }}
                />
                <RatsText text="Copy Link" style={{ color: color.baby_blue }} />
              </View>
            )}
          </View>
          <View
            style={{
              width: '100%',
              paddingVertical: normalize(10),
              paddingHorizontal: normalize(5),
            }}>
            {(meeting.type === 'AA' ||
              meeting.type === 'Custom' ||
              meeting.type === 'Celebrate Recovery') &&
              renderAAMeetingDescription(meeting)}
            {meeting.type === 'NA' && renderNAMeetingDescription(meeting)}
          </View>
          {userAsGuest && (
            <View style={{ paddingHorizontal: normalize(5) }}>
              {renderCheckInButton(meeting)}
            </View>
          )}
        </View>
      );
    },
    [
      renderMeetingImage,
      renderMeetingHeading,
      linkToDirections,
      renderAAMeetingDescription,
      renderNAMeetingDescription,
      renderCheckInButton,
      userAsGuest,
    ],
  );

  const meetingShouldRender = useCallback(
    (meeting: RatsMeeting) => {
      let shouldRender = true;

      if (filters.day !== 'all') {
        if (meeting.day) {
          shouldRender = shouldRender && filters.day === meeting.day;
        }
        if (meeting.daysAndTimes) {
          const dayTimes =
            meeting.daysAndTimes[filters.day as keyof typeof meeting.daysAndTimes];
          shouldRender = shouldRender && !!dayTimes && dayTimes.length > 0;
        }
      }

      if (filters.type && filters.type !== 'all') {
        shouldRender = shouldRender && filters.type === meeting.type;
      }

      if (searchTerm && searchTerm.length) {
        const isNumericSearch = !isNaN(parseInt(searchTerm));
        if (isNumericSearch && meeting.time) {
          const meetingTime = militaryTimeToStandard(meeting.time);
          shouldRender = shouldRender && meetingTime.includes(searchTerm);
        } else {
          shouldRender =
            shouldRender &&
            meeting.name.toLowerCase().includes(searchTerm.toLowerCase());
        }
      }

      return shouldRender;
    },
    [filters, searchTerm],
  );

  const renderMeetingListItem = useCallback(
    (info: ListRenderItemInfo<RatsMeeting>) => {
      return renderMeeting(info.item, info.index);
    },
    [renderMeeting],
  );

  const getMeetingTimeForSort = useCallback(
    (meeting: RatsMeeting): string => {
      if (meeting.time) return meeting.time;
      if (meeting.daysAndTimes && filters.day !== 'all') {
        return (
          meeting.daysAndTimes[filters.day as keyof typeof meeting.daysAndTimes] ||
          '00:00'
        );
      }
      return '00:00';
    },
    [filters],
  );

  const sortedMeetings = useMemo(
    () =>
      meetings
        .filter(m => meetingShouldRender(m))
        .sort((a, b) => {
          const aTime = getMeetingTimeForSort(a);
          const bTime = getMeetingTimeForSort(b);
          const aHour = parseInt(aTime.split(':')[0]) || 0;
          const bHour = parseInt(bTime.split(':')[0]) || 0;

          if (aHour === bHour) {
            const aMin = parseInt(aTime.split(':')[1]) || 0;
            const bMin = parseInt(bTime.split(':')[1]) || 0;
            return aMin - bMin;
          }
          return aHour - bHour;
        }),
    [meetings, meetingShouldRender, getMeetingTimeForSort],
  );

  return (
    <RatsFlatList<RatsMeeting>
      testID="meetings-list"
      scrollEnabled
      renderItem={renderMeetingListItem}
      data={sortedMeetings}
      keyExtractor={(_item, index) => index.toString()}
      removeClippedSubviews={true}
      initialNumToRender={5}
      maxToRenderPerBatch={1}
      updateCellsBatchingPeriod={100}
      windowSize={7}
      ItemSeparatorComponent={() => <View style={{ height: normalize(5) }} />}
    />
  );
};

export default MeetingResultsList;
