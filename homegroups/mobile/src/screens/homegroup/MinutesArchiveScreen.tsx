import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {GroupStackParamList} from '../../types/navigation';
import {
  BusinessMeetingDocument,
  MeetingMinutesDocument,
} from '../../types/schema';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';

type MinutesArchiveRouteProp = RouteProp<GroupStackParamList, 'MinutesArchive'>;
type MinutesArchiveNavigationProp = StackNavigationProp<GroupStackParamList>;

interface MeetingWithMinutes {
  meeting: BusinessMeetingDocument;
  minutes: MeetingMinutesDocument | null;
}

const MinutesArchiveScreen: React.FC = () => {
  const route = useRoute<MinutesArchiveRouteProp>();
  const navigation = useNavigation<MinutesArchiveNavigationProp>();
  const {groupId, groupName} = route.params;

  const [items, setItems] = useState<MeetingWithMinutes[]>([]);
  const [filteredItems, setFilteredItems] = useState<MeetingWithMinutes[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      // Load all business meetings for this group, newest first
      const meetingsSnapshot = await firestore()
        .collection('business_meetings')
        .where('groupId', '==', groupId)
        .orderBy('date', 'desc')
        .get();

      const meetings = meetingsSnapshot.docs.map(
        doc => ({id: doc.id, ...doc.data()} as BusinessMeetingDocument),
      );

      // For each meeting, check if minutes/record exists
      const withMinutes: MeetingWithMinutes[] = await Promise.all(
        meetings.map(async meeting => {
          try {
            const minutesDoc = await firestore()
              .collection('business_meetings')
              .doc(meeting.id)
              .collection('minutes')
              .doc('record')
              .get();

            return {
              meeting,
              minutes: minutesDoc.exists
                ? (minutesDoc.data() as MeetingMinutesDocument)
                : null,
            };
          } catch {
            return {meeting, minutes: null};
          }
        }),
      );

      setItems(withMinutes);
      setFilteredItems(withMinutes);
    } catch (error) {
      console.error('Error loading minutes archive:', error);
      Alert.alert('Error', 'Failed to load minutes archive.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredItems(items);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredItems(
      items.filter(item => {
        const dateStr = formatTimestamp(item.meeting.date).toLowerCase();
        return dateStr.includes(q);
      }),
    );
  }, [searchQuery, items]);

  const formatTimestamp = (ts: any): string => {
    try {
      const date =
        typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
      return format(date, 'MMM d, yyyy');
    } catch {
      return 'Unknown date';
    }
  };

  const getMeetingTimestamp = (ts: any): number => {
    try {
      const date =
        typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
      return date.getTime();
    } catch {
      return 0;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="minutes-archive-screen">
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Icon
          name="magnify"
          size={20}
          color="#9E9E9E"
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Filter by month or keyword..."
          placeholderTextColor="#9E9E9E"
          value={searchQuery}
          onChangeText={setSearchQuery}
          testID="minutes-search-input"
        />
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={item => item.meeting.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadData} />
        }
        contentContainerStyle={styles.listContent}
        renderItem={({item}) => {
          const {meeting, minutes} = item;
          const dateStr = formatTimestamp(meeting.date);
          const status = minutes?.status;
          const hasMinutes = !!minutes;

          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                navigation.navigate('MeetingMinutes', {
                  groupId,
                  groupName,
                  businessMeetingId: meeting.id,
                  meetingDate: getMeetingTimestamp(meeting.date),
                })
              }
              testID={`minutes-archive-row-${meeting.id}`}>
              <View style={styles.rowContent}>
                <Text style={styles.rowDate}>{dateStr}</Text>
                <Text style={styles.rowMeta}>
                  {hasMinutes
                    ? `${minutes!.attendanceCount} members`
                    : 'No minutes recorded'}
                </Text>
              </View>
              <View style={styles.rowRight}>
                {hasMinutes ? (
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          status === 'approved' ? '#4CAF50' : '#FF9800',
                      },
                    ]}>
                    <Text style={styles.statusBadgeText}>
                      {status === 'approved' ? 'APPROVED' : 'DRAFT'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.noMinutesBadge}>
                    <Text style={styles.noMinutesBadgeText}>NONE</Text>
                  </View>
                )}
                <Icon name="chevron-right" size={18} color="#9E9E9E" />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="notebook-outline" size={48} color="#BDBDBD" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No results found.' : 'No business meetings yet.'}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  loadingContainer: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 12,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  searchIcon: {marginRight: 8},
  searchInput: {flex: 1, paddingVertical: 12, fontSize: 14, color: '#212121'},
  listContent: {paddingHorizontal: 12, paddingBottom: 32},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  rowContent: {flex: 1},
  rowDate: {fontSize: 15, fontWeight: '600', color: '#212121'},
  rowMeta: {fontSize: 13, color: '#9E9E9E', marginTop: 2},
  rowRight: {flexDirection: 'row', alignItems: 'center', gap: 8},
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusBadgeText: {fontSize: 11, color: '#FFF', fontWeight: '700'},
  noMinutesBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
  },
  noMinutesBadgeText: {fontSize: 11, color: '#757575', fontWeight: '700'},
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {fontSize: 16, color: '#9E9E9E', textAlign: 'center'},
});

export default MinutesArchiveScreen;
