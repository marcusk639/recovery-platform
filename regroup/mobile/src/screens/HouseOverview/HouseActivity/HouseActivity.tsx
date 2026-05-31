import React, { useCallback } from 'react';
import {
  View,
  FlatList,
  ViewStyle,
  TextStyle,
  ListRenderItemInfo,
  RefreshControl,
} from 'react-native';
import RatsLoadingIndicator from '../../../components/rats-loading-indicator/rats-loading-indicator';
import { RatsText } from '../../../components/rats-text';
import ScreenHeader from '../../../components/screen-header';
import { RatsIcon } from '../../../components/rats-icon';
import { useAppSelector } from '../../../state/hooks';
import { useSelectedHouse } from '../../../hooks/useSelectedHouse';
import { useGuests } from '../../../state/queries/guestQueries';
import { useHouseActivities } from '../../../state/queries';
import { Activity, ActivityType } from '../../../entities/ActivityModel';
import {
  color,
  fontSize,
  normalize,
  CARD_STYLE,
  ROW,
  fontFamily,
} from '../../../styles/theme';

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ACTIVITY_ICON: Record<ActivityType, { name: string; color: string }> = {
  [ActivityType.MEETING]: { name: 'users', color: color.baby_blue },
  [ActivityType.WORK]: { name: 'briefcase', color: color.green },
  [ActivityType.CHORE]: { name: 'broom', color: color.orange },
  [ActivityType.MEDICATION]: { name: 'pills', color: color.purple },
  [ActivityType.PRIMARY_SUPPORTER]: {
    name: 'hands-helping',
    color: color.cobalt,
  },
};

function getActivityLabel(activity: Activity): string {
  const data = activity.data;
  if (!data) return 'Activity';
  switch (data.type) {
    case ActivityType.MEETING:
      return data.meetingName || 'Meeting';
    case ActivityType.WORK:
      return `${data.hoursWorked ?? 0}h at ${data.jobName || 'Work'}`;
    case ActivityType.CHORE:
      return data.choreName || 'Chore';
    case ActivityType.MEDICATION:
      return data.medicationName || 'Medication';
    case ActivityType.PRIMARY_SUPPORTER:
      return `Met with ${data.supporterName || 'Supporter'}`;
    default:
      return 'Activity';
  }
}

function formatDate(timestamp: Date | string | undefined): string {
  if (!timestamp) return '';
  try {
    const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CONTAINER: ViewStyle = {
  flexGrow: 1,
  backgroundColor: color.light_grey,
};

const CARD: ViewStyle = {
  ...CARD_STYLE,
  marginBottom: 2,
  paddingVertical: normalize(12),
  paddingHorizontal: normalize(16),
};

const ACTIVITY_ROW: ViewStyle = {
  ...ROW,
  alignItems: 'center',
};

const ICON_CIRCLE: ViewStyle = {
  width: normalize(40),
  height: normalize(40),
  borderRadius: normalize(20),
  backgroundColor: color.light_blue,
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: normalize(12),
  flexShrink: 0,
};

const DETAIL_CONTAINER: ViewStyle = {
  flex: 1,
};

const DATE_TEXT: TextStyle = {
  fontSize: fontSize.extraSmall,
  color: color.grey,
  marginTop: normalize(2),
};

const EMPTY_CONTAINER: ViewStyle = {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: normalize(60),
};

const ERROR_CONTAINER: ViewStyle = {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: normalize(60),
  paddingHorizontal: normalize(24),
};

// ─── ActivityRow ──────────────────────────────────────────────────────────────

interface ActivityRowProps {
  activity: Activity;
  guestName: string;
}

const ActivityRow: React.FC<ActivityRowProps> = ({ activity, guestName }) => {
  const iconDef = ACTIVITY_ICON[activity.type] || {
    name: 'circle',
    color: color.grey,
  };
  const label = getActivityLabel(activity);
  const dateStr = formatDate(activity.timestamp);

  return (
    <View style={CARD} testID={`activity-row-${activity.id}`}>
      <View style={ACTIVITY_ROW}>
        {/* Icon circle */}
        <View style={[ICON_CIRCLE, { backgroundColor: iconDef.color + '22' }]}>
          <RatsIcon
            name={iconDef.name}
            size={normalize(18)}
            style={{ color: iconDef.color }}
            solid
          />
        </View>

        {/* Detail */}
        <View style={DETAIL_CONTAINER}>
          <RatsText
            translate={false}
            text={label}
            style={{
              fontSize: fontSize.regular,
              color: color.black,
              fontFamily: fontFamily.bold,
            }}
          />
          {!!guestName && (
            <RatsText
              translate={false}
              text={guestName}
              style={{
                fontSize: fontSize.small,
                color: color.dark_grey,
                fontFamily: fontFamily.roboto,
              }}
            />
          )}
          {!!dateStr && (
            <RatsText translate={false} text={dateStr} style={DATE_TEXT} />
          )}
        </View>
      </View>
    </View>
  );
};

// ─── HouseActivity ────────────────────────────────────────────────────────────

const HouseActivity: React.FC = () => {
  const { house } = useSelectedHouse();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(house?.id ?? '');

  const {
    data: activities,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useHouseActivities(house?.id || '', 50, !!house?.id);

  if (!house) {
    return <RatsLoadingIndicator />;
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: color.light_grey }}>
        <ScreenHeader header="Activity Feed" />
        <View testID="activity-loading" style={{ flex: 1 }}>
          <RatsLoadingIndicator />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={{ flex: 1, backgroundColor: color.light_grey }}>
        <ScreenHeader header="Activity Feed" />
        <View style={ERROR_CONTAINER} testID="activity-error">
          <RatsIcon
            name="exclamation-circle"
            size={normalize(36)}
            style={{ color: color.red, marginBottom: normalize(12) }}
            solid
          />
          <RatsText
            translate={false}
            text="Unable to load activity"
            style={{
              fontSize: fontSize.medium,
              color: color.dark_grey,
              fontFamily: fontFamily.bold,
            }}
          />
          <RatsText
            translate={false}
            text="Check your connection and try again."
            style={{
              fontSize: fontSize.regular,
              color: color.grey,
              marginTop: normalize(8),
              textAlign: 'center',
            }}
          />
        </View>
      </View>
    );
  }

  const activityList: Activity[] = activities || [];

  // Wrap in useCallback so FlatList cell memoization isn't invalidated on
  // every 30s poll tick (useHouseActivities refetch produces a new
  // activities array reference even when content is unchanged).
  const renderItem = useCallback(
    (info: ListRenderItemInfo<Activity>) => {
      const activity = info.item;
      const guest = guests[activity.guestId];
      const guestName = guest
        ? `${guest.firstName || ''} ${guest.lastName || ''}`.trim()
        : '';
      return <ActivityRow activity={activity} guestName={guestName} />;
    },
    [guests],
  );

  const renderEmpty = useCallback(
    () => (
      <View style={EMPTY_CONTAINER} testID="activity-empty">
        <RatsIcon
          name="clipboard-list"
          size={normalize(40)}
          style={{ color: color.medium_grey, marginBottom: normalize(12) }}
          solid
        />
        <RatsText
          translate={false}
          text="No activity yet"
          style={{
            fontSize: fontSize.medium,
            color: color.dark_grey,
            fontFamily: fontFamily.bold,
          }}
        />
        <RatsText
          translate={false}
          text="Activities logged by residents will appear here."
          style={{
            fontSize: fontSize.regular,
            color: color.grey,
            marginTop: normalize(8),
            textAlign: 'center',
          }}
        />
      </View>
    ),
    [],
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader header="Activity Feed" />
      <FlatList
        testID="activity-list"
        data={activityList}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        scrollEnabled={true}
        contentContainerStyle={CONTAINER}
        removeClippedSubviews={true}
        windowSize={5}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor={color.baby_blue}
          />
        }
      />
    </View>
  );
};

export default HouseActivity;
