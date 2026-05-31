// mobile/src/screens/homegroup/GroupCalendarScreen.tsx
// V2.2 Task 4.1 — Calendar View (grouped by date, no external calendar dependency)
import React, {useState, useCallback, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';

import {GroupStackParamList} from '../../types/navigation';
import {MeetingInstance} from '../../types';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchUpcomingMeetingInstances,
  selectAllMeetingInstances,
  selectGroupMeetingInstanceIds,
} from '../../store/slices/meetingsSlice';

type GroupCalendarRouteProp = RouteProp<GroupStackParamList, 'GroupCalendar'>;
type GroupCalendarNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'GroupCalendar'
>;

/**
 * Groups an array of MeetingInstances by their date string (YYYY-MM-DD).
 * Returns an array of [dateKey, instances[]] pairs sorted chronologically.
 */
function groupByDate(
  instances: MeetingInstance[],
): [string, MeetingInstance[]][] {
  const map: Record<string, MeetingInstance[]> = {};
  for (const inst of instances) {
    const key = moment(inst.scheduledAt).format('YYYY-MM-DD');
    if (!map[key]) {
      map[key] = [];
    }
    map[key].push(inst);
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

const GroupCalendarScreen: React.FC = () => {
  const route = useRoute<GroupCalendarRouteProp>();
  const navigation = useNavigation<GroupCalendarNavigationProp>();
  const {groupId, groupName} = route.params;

  const dispatch = useAppDispatch();

  const instanceIds = useAppSelector(state =>
    selectGroupMeetingInstanceIds(state, groupId),
  );
  const allInstances = useAppSelector(selectAllMeetingInstances);
  const instances: MeetingInstance[] = (instanceIds ?? [])
    .map(id => allInstances[id])
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async () => {
      try {
        await dispatch(fetchUpcomingMeetingInstances(groupId)).unwrap();
      } catch (_) {
        // ignore — data may already be cached
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dispatch, groupId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const grouped = groupByDate(instances);

  const renderDaySection = (
    dateKey: string,
    dayInstances: MeetingInstance[],
  ) => {
    const dayMoment = moment(dateKey);
    const isToday = dayMoment.isSame(moment(), 'day');
    const isTomorrow = dayMoment.isSame(moment().add(1, 'day'), 'day');

    let dayLabel = dayMoment.format('dddd, MMM D');
    if (isToday) dayLabel = `Today — ${dayMoment.format('MMM D')}`;
    if (isTomorrow) dayLabel = `Tomorrow — ${dayMoment.format('MMM D')}`;

    return (
      <View key={dateKey} style={styles.daySection}>
        <View
          style={[styles.dayHeader, isToday && styles.dayHeaderToday]}>
          <Text
            style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
            {dayLabel}
          </Text>
        </View>
        {dayInstances.map(inst => renderInstance(inst))}
      </View>
    );
  };

  const renderInstance = (inst: MeetingInstance) => {
    const timeStr = moment(inst.scheduledAt).format('h:mm A');
    const locationDisplay = inst.isOnline
      ? 'Online Meeting'
      : inst.locationName || inst.address || 'Location TBD';

    return (
      <TouchableOpacity
        key={inst.instanceId}
        style={[
          styles.instanceCard,
          inst.isCancelled && styles.instanceCardCancelled,
        ]}
        onPress={() =>
          navigation.navigate('EditMeetingInstance', {
            groupId,
            groupName,
            instanceId: inst.instanceId,
          })
        }
        testID={`calendar-instance-${inst.instanceId}`}>
        <View style={styles.timeCol}>
          <Text style={styles.timeText}>{timeStr}</Text>
          {inst.isCancelled && (
            <Icon name="cancel" size={14} color="#D32F2F" style={{marginTop: 4}} />
          )}
        </View>
        <View style={styles.detailCol}>
          <Text
            style={[
              styles.instanceName,
              inst.isCancelled && styles.instanceNameCancelled,
            ]}>
            {inst.name}
          </Text>
          <Text style={styles.locationText}>{locationDisplay}</Text>
          {inst.chairpersonName ? (
            <Text style={styles.chairText}>Chair: {inst.chairpersonName}</Text>
          ) : null}
          {inst.isCancelled && (
            <Text style={styles.cancelledLabel}>Cancelled</Text>
          )}
          {inst.instanceNotice && !inst.isCancelled ? (
            <Text style={styles.noticeText}>{inst.instanceNotice}</Text>
          ) : null}
        </View>
        {inst.isOnline ? (
          <Icon name="video" size={20} color="#2196F3" style={styles.typeIcon} />
        ) : (
          <Icon name="map-marker" size={20} color="#757575" style={styles.typeIcon} />
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }>
      {grouped.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="calendar-blank" size={64} color="#BBDEFB" />
          <Text style={styles.emptyTitle}>No Upcoming Meetings</Text>
          <Text style={styles.emptyText}>
            Meetings will appear here once they have been scheduled.
          </Text>
        </View>
      ) : (
        grouped.map(([dateKey, dayInstances]) =>
          renderDaySection(dateKey, dayInstances),
        )
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  daySection: {
    marginBottom: 8,
  },
  dayHeader: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  dayHeaderToday: {
    backgroundColor: '#1976D2',
    borderLeftColor: '#0D47A1',
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1565C0',
    letterSpacing: 0.3,
  },
  dayLabelToday: {
    color: '#FFFFFF',
  },
  instanceCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.07,
    shadowRadius: 2,
    elevation: 1,
  },
  instanceCardCancelled: {
    backgroundColor: '#FFF0F0',
    opacity: 0.75,
  },
  timeCol: {
    width: 60,
    alignItems: 'center',
    marginRight: 12,
    borderRightWidth: 1,
    borderRightColor: '#EEEEEE',
    paddingRight: 12,
  },
  timeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  detailCol: {
    flex: 1,
  },
  instanceName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 2,
  },
  instanceNameCancelled: {
    textDecorationLine: 'line-through',
    color: '#9E9E9E',
  },
  locationText: {
    fontSize: 13,
    color: '#616161',
  },
  chairText: {
    fontSize: 12,
    color: '#2196F3',
    marginTop: 2,
  },
  cancelledLabel: {
    fontSize: 12,
    color: '#D32F2F',
    fontWeight: '600',
    marginTop: 2,
  },
  noticeText: {
    fontSize: 12,
    color: '#FFA000',
    fontStyle: 'italic',
    marginTop: 2,
  },
  typeIcon: {
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: '#757575',
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default GroupCalendarScreen;
