// mobile/src/screens/meetings/MeetingDetailScreen.tsx
// V3.2 Task 2.2 — Meeting Detail for non-member discovery
//
// Shows full meeting details for a user discovering a group via the finder.
// - "Join This Group" button for RecoveryConnect groups
// - "Favorite" toggle
// - "View Group" deep link into GroupOverview for RecoveryConnect groups
// - "Is this your group? Get it on RecoveryConnect" for external meetings

import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';

import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  selectMeetingById,
  toggleFavoriteMeeting,
} from '../../store/slices/meetingsSlice';
import {
  fetchGroupById,
  selectGroupById,
} from '../../store/slices/groupsSlice';

type MeetingDetailRouteProp = RouteProp<GroupStackParamList, 'MeetingDetail'>;
type MeetingDetailNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'MeetingDetail'
>;

const MeetingDetailScreen: React.FC = () => {
  const route = useRoute<MeetingDetailRouteProp>();
  const navigation = useNavigation<MeetingDetailNavigationProp>();
  const dispatch = useAppDispatch();

  const {meetingId, groupId, source} = route.params;

  const meeting = useAppSelector(state =>
    meetingId ? selectMeetingById(state, meetingId) : undefined,
  );
  const group = useAppSelector(state =>
    groupId ? selectGroupById(state, groupId) : undefined,
  );

  const [groupLoading, setGroupLoading] = useState(false);

  // Derive favorite state from user's favoriteMeetings (local optimistic)
  const [isFavorite, setIsFavorite] = useState(false);

  // Set screen title
  useEffect(() => {
    navigation.setOptions({
      title: meeting?.name || 'Meeting Details',
    });
  }, [navigation, meeting]);

  // Load group data when we have a groupId
  useEffect(() => {
    if (groupId && !group) {
      setGroupLoading(true);
      dispatch(fetchGroupById(groupId))
        .unwrap()
        .catch(err => {
          if (err?.name !== 'ConditionError') {
            console.error('Error loading group for meeting detail:', err);
          }
        })
        .finally(() => setGroupLoading(false));
    }
  }, [groupId, group, dispatch]);

  const handleToggleFavorite = () => {
    if (meetingId) {
      dispatch(toggleFavoriteMeeting(meetingId));
      setIsFavorite(prev => !prev);
    }
  };

  const handleViewGroup = () => {
    if (groupId && group) {
      navigation.navigate('GroupOverview', {
        groupId,
        groupName: group.name,
      });
    }
  };

  const handleJoinGroup = () => {
    if (groupId && group) {
      navigation.navigate('GroupOverview', {
        groupId,
        groupName: group.name,
      });
    } else {
      Alert.alert(
        'Join Group',
        'Contact the group directly to request membership.',
      );
    }
  };

  const handleGetDirections = () => {
    if (!meeting?.lat || !meeting?.lng) {
      return;
    }
    const scheme = Platform.select({
      ios: 'maps:0,0?q=',
      android: 'geo:0,0?q=',
    });
    const latLng = `${meeting.lat},${meeting.lng}`;
    const label = encodeURIComponent(meeting.name || 'Meeting');
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`,
    });
    if (url) {
      Linking.openURL(url);
    }
  };

  const handleJoinOnline = () => {
    const url = meeting?.link;
    if (url) {
      Linking.openURL(url);
    }
  };

  const formatDayAndTime = (): string => {
    if (!meeting) {
      return 'Schedule TBD';
    }
    const day = meeting.day
      ? meeting.day.charAt(0).toUpperCase() + meeting.day.slice(1)
      : '';
    const timeStr = meeting.time
      ? moment(meeting.time, ['HH:mm', 'HH:mm:ss', 'h:mm A']).format('h:mm A')
      : 'Time TBD';
    return day ? `${day} at ${timeStr}` : timeStr;
  };

  const formatFullAddress = (): string => {
    if (!meeting) {
      return '';
    }
    if (meeting.online) {
      return 'Online Meeting';
    }
    const street = meeting.address || meeting.street || '';
    const cityStateZip = [meeting.city, meeting.state, meeting.zip]
      .filter(Boolean)
      .join(', ');
    const country = meeting.country && meeting.country !== 'US' ? meeting.country : '';
    return [street, cityStateZip, country].filter(Boolean).join('\n');
  };

  if (!meeting) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading meeting details...</Text>
      </SafeAreaView>
    );
  }

  const isOnline = meeting.online ?? false;
  const isRecoveryConnect = source === 'recoveryconnect';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{meeting.type || 'Meeting'}</Text>
            </View>
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={styles.favoriteButton}
              testID="favorite-toggle"
              accessibilityLabel={
                isFavorite ? 'Remove from favorites' : 'Add to favorites'
              }>
              <Icon
                name={isFavorite ? 'star' : 'star-outline'}
                size={28}
                color={isFavorite ? '#FFC107' : '#BDBDBD'}
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.meetingName}>{meeting.name}</Text>
          {meeting.format ? (
            <View style={styles.formatBadge}>
              <Text style={styles.formatBadgeText}>{meeting.format}</Text>
            </View>
          ) : null}
        </View>

        {/* Details section */}
        <View style={styles.section}>
          <View style={styles.detailRow}>
            <Icon name="clock-outline" size={20} color="#2196F3" style={styles.detailIcon} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>When</Text>
              <Text style={styles.detailValue}>{formatDayAndTime()}</Text>
            </View>
          </View>

          <View style={styles.separator} />

          <View style={styles.detailRow}>
            <Icon
              name={isOnline ? 'laptop' : 'map-marker-outline'}
              size={20}
              color="#2196F3"
              style={styles.detailIcon}
            />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>
                {isOnline ? 'Format' : 'Location'}
              </Text>
              {isOnline ? (
                <Text style={styles.detailValue}>Online Meeting</Text>
              ) : (
                <>
                  {meeting.locationName ? (
                    <Text style={styles.detailValue}>{meeting.locationName}</Text>
                  ) : null}
                  <Text style={styles.detailSubValue}>{formatFullAddress()}</Text>
                </>
              )}
            </View>
          </View>

          {meeting.type ? (
            <>
              <View style={styles.separator} />
              <View style={styles.detailRow}>
                <Icon
                  name="account-group-outline"
                  size={20}
                  color="#2196F3"
                  style={styles.detailIcon}
                />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Program</Text>
                  <Text style={styles.detailValue}>{meeting.type}</Text>
                </View>
              </View>
            </>
          ) : null}
        </View>

        {/* Group info for RecoveryConnect meetings */}
        {isRecoveryConnect && groupLoading && (
          <View style={styles.section}>
            <ActivityIndicator size="small" color="#2196F3" />
          </View>
        )}
        {isRecoveryConnect && group && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About the Group</Text>
            <Text style={styles.groupName}>{group.name}</Text>
            {group.publicDescription ? (
              <Text style={styles.groupDescription}>
                {group.publicDescription}
              </Text>
            ) : group.description ? (
              <Text style={styles.groupDescription}>{group.description}</Text>
            ) : null}
          </View>
        )}

        {/* Online meeting notes */}
        {isOnline && meeting.onlineNotes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Online Meeting Notes</Text>
            <Text style={styles.notesText}>{meeting.onlineNotes}</Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actionsSection}>
          {/* Online: Join link */}
          {isOnline && meeting.link ? (
            <TouchableOpacity
              style={[styles.actionButton, styles.primaryAction]}
              onPress={handleJoinOnline}
              testID="join-online-btn">
              <Icon name="video-outline" size={20} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>Join Online</Text>
            </TouchableOpacity>
          ) : null}

          {/* In-person: Directions */}
          {!isOnline && meeting.lat && meeting.lng ? (
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryAction]}
              onPress={handleGetDirections}
              testID="get-directions-btn">
              <Icon name="directions" size={20} color="#2196F3" />
              <Text style={styles.secondaryActionText}>Get Directions</Text>
            </TouchableOpacity>
          ) : null}

          {/* RecoveryConnect group: View Group + Join */}
          {isRecoveryConnect && group ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.primaryAction]}
                onPress={handleJoinGroup}
                testID="join-group-btn">
                <Icon name="account-plus-outline" size={20} color="#FFFFFF" />
                <Text style={styles.primaryActionText}>Join This Group</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryAction]}
                onPress={handleViewGroup}
                testID="view-group-btn">
                <Icon name="home-outline" size={20} color="#2196F3" />
                <Text style={styles.secondaryActionText}>View Group</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {/* External meeting: Get it on RecoveryConnect CTA */}
          {!isRecoveryConnect ? (
            <TouchableOpacity
              style={styles.externalCta}
              onPress={() =>
                Linking.openURL('https://recoveryconnect.app/get-listed')
              }
              testID="external-cta">
              <Icon name="plus-circle-outline" size={18} color="#2196F3" />
              <Text style={styles.externalCtaText}>
                Is this your group? Get it on RecoveryConnect
              </Text>
              <Icon name="chevron-right" size={16} color="#2196F3" />
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: '#757575',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 8,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  typeBadge: {
    backgroundColor: '#1565C0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  favoriteButton: {
    padding: 4,
  },
  meetingName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
    lineHeight: 30,
  },
  formatBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  formatBadgeText: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  detailIcon: {
    marginTop: 2,
    marginRight: 14,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#9E9E9E',
    marginBottom: 2,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 16,
    color: '#212121',
    fontWeight: '500',
    lineHeight: 22,
  },
  detailSubValue: {
    fontSize: 14,
    color: '#757575',
    lineHeight: 20,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#F5F5F5',
    marginVertical: 4,
  },
  groupName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 6,
  },
  groupDescription: {
    fontSize: 15,
    color: '#616161',
    lineHeight: 22,
  },
  notesText: {
    fontSize: 15,
    color: '#616161',
    lineHeight: 22,
    fontStyle: 'italic',
  },
  actionsSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
    minHeight: 50,
  },
  primaryAction: {
    backgroundColor: '#2196F3',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryAction: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#2196F3',
  },
  secondaryActionText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '600',
  },
  externalCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
    minHeight: 50,
  },
  externalCtaText: {
    flex: 1,
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '500',
  },
});

export default MeetingDetailScreen;
