import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchBusinessMeetingsForGroup,
  selectBusinessMeetingsByGroupId,
  selectBusinessMeetingsStatus,
  selectBusinessMeetingsError,
} from '../../store/slices/businessMeetingsSlice';
import {selectGroupById} from '../../store/slices/groupsSlice';
import {BusinessMeeting} from '../../types/domain/business-meeting';

type BusinessMeetingsListScreenRouteProp = RouteProp<
  GroupStackParamList,
  'BusinessMeetingsList'
>;
type BusinessMeetingsListScreenNavigationProp =
  StackNavigationProp<GroupStackParamList>;

type FilterType = 'upcoming' | 'past' | 'all';

const BusinessMeetingsListScreen: React.FC = () => {
  const route = useRoute<BusinessMeetingsListScreenRouteProp>();
  const navigation = useNavigation<BusinessMeetingsListScreenNavigationProp>();
  const {groupId, groupName} = route.params;

  const dispatch = useAppDispatch();

  // Get data from Redux store
  const meetings = useAppSelector(state =>
    selectBusinessMeetingsByGroupId(state, groupId),
  );
  const status = useAppSelector(selectBusinessMeetingsStatus);
  const error = useAppSelector(selectBusinessMeetingsError);
  const group = useAppSelector(state => selectGroupById(state, groupId));

  const loading = status === 'loading';
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filter, setFilter] = useState<FilterType>('upcoming');

  useEffect(() => {
    loadMeetings();
    checkAdminStatus();
  }, [groupId]);

  const checkAdminStatus = () => {
    const currentUser = auth().currentUser;
    if (!currentUser) return;
    const isUserAdmin = group?.admins?.includes(currentUser.uid) || false;
    setIsAdmin(isUserAdmin);
  };

  const loadMeetings = useCallback(() => {
    setRefreshing(true);
    dispatch(fetchBusinessMeetingsForGroup(groupId))
      .unwrap()
      .catch(err => {
        if (err && err.name !== 'ConditionError') {
          Alert.alert(
            'Error',
            'Failed to load business meetings. Please try again later.',
          );
        }
      })
      .finally(() => {
        setRefreshing(false);
      });
  }, [dispatch, groupId]);

  const filteredMeetings = useCallback(() => {
    const now = new Date();
    switch (filter) {
      case 'upcoming':
        return meetings
          .filter(m => m.date >= now && m.status !== 'cancelled')
          .sort((a, b) => a.date.getTime() - b.date.getTime());
      case 'past':
        return meetings
          .filter(m => m.date < now || m.status === 'completed')
          .sort((a, b) => b.date.getTime() - a.date.getTime());
      default:
        return meetings.sort((a, b) => b.date.getTime() - a.date.getTime());
    }
  }, [meetings, filter]);

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (time: string): string => {
    // Assume time is in HH:mm format
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const getStatusColor = (status: BusinessMeeting['status']) => {
    switch (status) {
      case 'scheduled':
        return '#2196F3';
      case 'in_progress':
        return '#FF9800';
      case 'completed':
        return '#4CAF50';
      case 'cancelled':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusLabel = (status: BusinessMeeting['status']) => {
    switch (status) {
      case 'scheduled':
        return 'Scheduled';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const handleViewDetails = (meeting: BusinessMeeting) => {
    navigation.navigate('BusinessMeetingDetail', {
      groupId,
      groupName,
      meetingId: meeting.id,
    });
  };

  const handleCreate = () => {
    navigation.navigate('CreateEditBusinessMeeting', {
      groupId,
      groupName,
    });
  };

  const renderFilterTabs = () => (
    <View style={styles.filterContainer}>
      {(['upcoming', 'past', 'all'] as FilterType[]).map(f => (
        <TouchableOpacity
          key={f}
          style={[styles.filterTab, filter === f && styles.filterTabActive]}
          onPress={() => setFilter(f)}>
          <Text
            style={[
              styles.filterTabText,
              filter === f && styles.filterTabTextActive,
            ]}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderItem = ({item}: {item: BusinessMeeting}) => (
    <TouchableOpacity
      style={styles.meetingCard}
      onPress={() => handleViewDetails(item)}
      testID={`business-meeting-card-${item.id}`}>
      <View style={styles.cardHeader}>
        <View style={styles.dateContainer}>
          <Icon name="calendar" size={20} color="#2196F3" />
          <Text style={styles.dateText}>{formatDate(item.date)}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {backgroundColor: getStatusColor(item.status)},
          ]}>
          <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.timeRow}>
          <Icon name="clock-outline" size={16} color="#757575" />
          <Text style={styles.timeText}>{formatTime(item.startTime)}</Text>
          {item.endTime && (
            <Text style={styles.timeText}> - {formatTime(item.endTime)}</Text>
          )}
        </View>

        <View style={styles.locationRow}>
          <Icon
            name={item.isOnline ? 'video' : 'map-marker'}
            size={16}
            color="#757575"
          />
          <Text style={styles.locationText} numberOfLines={1}>
            {item.isOnline ? 'Online Meeting' : item.location}
          </Text>
        </View>

        {item.agenda && item.agenda.length > 0 && (
          <View style={styles.agendaPreview}>
            <Icon name="format-list-bulleted" size={16} color="#757575" />
            <Text style={styles.agendaCount}>
              {item.agenda.length} agenda item
              {item.agenda.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <Icon name="chevron-right" size={24} color="#BDBDBD" />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView
      style={styles.container}
      testID={`business-meetings-list-screen-${groupId}`}>
      {renderFilterTabs()}

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color="#2196F3"
            testID="business-meetings-loader"
          />
        </View>
      ) : error ? (
        <Text style={styles.errorText} testID="business-meetings-error-text">
          Error: {error}
        </Text>
      ) : (
        <View style={styles.listContainer}>
          <FlatList
            data={filteredMeetings()}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.meetingsList}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={loadMeetings}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Icon name="calendar-blank" size={64} color="#BDBDBD" />
                <Text style={styles.emptyTitle}>
                  No {filter !== 'all' ? filter : ''} business meetings
                </Text>
                <Text style={styles.emptyText}>
                  {isAdmin
                    ? 'Tap the button below to schedule a business meeting.'
                    : 'Check back later for scheduled business meetings.'}
                </Text>
              </View>
            }
            testID="business-meetings-list"
          />

          {isAdmin && (
            <TouchableOpacity
              style={styles.fab}
              onPress={handleCreate}
              testID="create-business-meeting-button">
              <Icon name="plus" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  filterTabActive: {
    backgroundColor: '#E3F2FD',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#757575',
  },
  filterTabTextActive: {
    color: '#2196F3',
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meetingsList: {
    padding: 16,
    paddingBottom: 80,
  },
  meetingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginLeft: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardBody: {
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeText: {
    fontSize: 14,
    color: '#424242',
    marginLeft: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationText: {
    fontSize: 14,
    color: '#757575',
    marginLeft: 8,
    flex: 1,
  },
  agendaPreview: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agendaCount: {
    fontSize: 14,
    color: '#757575',
    marginLeft: 8,
  },
  cardFooter: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  errorText: {
    color: '#F44336',
    textAlign: 'center',
    marginTop: 16,
  },
});

export default BusinessMeetingsListScreen;
