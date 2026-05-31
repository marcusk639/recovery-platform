import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList} from '../../types/navigation';
import {useAppSelector} from '../../store';
import {
  selectAllMeetingInstances,
  selectGroupMeetingInstanceIds,
} from '../../store/slices/meetingsSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';
import {FEATURE_FLAGS} from '../../config/featureFlags';

type SecretaryToolkitRouteProp = RouteProp<
  GroupStackParamList,
  'SecretaryToolkit'
>;
type SecretaryToolkitNavigationProp = StackNavigationProp<GroupStackParamList>;

const SecretaryToolkitScreen: React.FC = () => {
  const route = useRoute<SecretaryToolkitRouteProp>();
  const navigation = useNavigation<SecretaryToolkitNavigationProp>();
  const {groupId, groupName} = route.params;

  const [refreshing, setRefreshing] = useState(false);

  const instanceIds = useAppSelector(state =>
    selectGroupMeetingInstanceIds(state, groupId),
  );
  const allInstances = useAppSelector(state =>
    selectAllMeetingInstances(state),
  );

  const upcomingInstances = (instanceIds || [])
    .map(id => allInstances[id])
    .filter(Boolean)
    .filter(instance => !instance.isCancelled)
    .filter(instance => {
      const sat = instance.scheduledAt as any;
      const instanceDate = sat?.toDate?.() ?? new Date(sat);
      return instanceDate >= new Date();
    })
    .sort((a, b) => {
      const aTime = (
        (a.scheduledAt as any)?.toDate?.() ?? new Date(a.scheduledAt as any)
      ).getTime();
      const bTime = (
        (b.scheduledAt as any)?.toDate?.() ?? new Date(b.scheduledAt as any)
      ).getTime();
      return aTime - bTime;
    })
    .slice(0, 5);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const formatInstanceDate = (scheduledAt: any): string => {
    try {
      const date =
        scheduledAt instanceof Date
          ? scheduledAt
          : typeof scheduledAt?.toDate === 'function'
          ? scheduledAt.toDate()
          : new Date(scheduledAt);
      return moment(date).format('ddd, MMM D [at] h:mm A');
    } catch {
      return 'Unknown date';
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
      testID="secretary-toolkit-screen">
      {/* Header */}
      <View style={styles.pageHeader}>
        <Icon name="clipboard-check-outline" size={32} color="#7B1FA2" />
        <Text style={styles.pageHeaderTitle}>Secretary Toolkit</Text>
        <Text style={styles.pageHeaderSubtitle}>
          Pre-meeting checklists and meeting management tools
        </Text>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Start</Text>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() =>
            navigation.navigate('MeetingChecklist', {groupId, groupName})
          }
          testID="start-checklist-button">
          <View style={styles.quickActionIcon}>
            <Icon name="format-list-checks" size={24} color="#7B1FA2" />
          </View>
          <View style={styles.quickActionContent}>
            <Text style={styles.quickActionTitle}>Start Meeting Checklist</Text>
            <Text style={styles.quickActionSubtitle}>
              Open the interactive before/during/after checklist
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color="#9E9E9E" />
        </TouchableOpacity>

        {/* V4.2.3: Browse Meeting Topics — hidden (secretary-only edge case) */}
        {FEATURE_FLAGS.SHOW_V4_CONTENT_MEETING_TOPICS && (
          <TouchableOpacity
            style={[
              styles.quickActionButton,
              styles.quickActionButtonSecondary,
            ]}
            onPress={() =>
              navigation.navigate('MeetingTopics', {groupId, groupName})
            }
            testID="browse-meeting-topics-button">
            <View
              style={[styles.quickActionIcon, styles.quickActionIconSecondary]}>
              <Icon name="lightbulb-on-outline" size={24} color="#1976D2" />
            </View>
            <View style={styles.quickActionContent}>
              <Text
                style={[
                  styles.quickActionTitle,
                  styles.quickActionTitleSecondary,
                ]}>
                Browse Meeting Topics
              </Text>
              <Text
                style={[
                  styles.quickActionSubtitle,
                  styles.quickActionSubtitleSecondary,
                ]}>
                Find and favorite discussion topics for upcoming meetings
              </Text>
            </View>
            <Icon name="chevron-right" size={20} color="#9E9E9E" />
          </TouchableOpacity>
        )}
      </View>

      {/* Upcoming Meetings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming Meetings</Text>
        {upcomingInstances.length > 0 ? (
          upcomingInstances.map(instance => (
            <TouchableOpacity
              key={instance.instanceId}
              style={styles.meetingRow}
              onPress={() =>
                navigation.navigate('MeetingChecklist', {
                  groupId,
                  groupName,
                  meetingId: instance.instanceId,
                })
              }
              testID={`meeting-row-${instance.instanceId}`}>
              <View style={styles.meetingRowLeft}>
                <Icon
                  name="calendar-clock"
                  size={20}
                  color="#7B1FA2"
                  style={{marginRight: 10}}
                />
                <View>
                  <Text style={styles.meetingRowName}>{instance.name}</Text>
                  <Text style={styles.meetingRowDate}>
                    {formatInstanceDate(instance.scheduledAt)}
                  </Text>
                  {instance.locationName && (
                    <Text style={styles.meetingRowLocation}>
                      {instance.locationName}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.meetingRowRight}>
                <Text style={styles.startChecklistLabel}>Checklist</Text>
                <Icon name="chevron-right" size={18} color="#7B1FA2" />
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.emptyStateText}>
            No upcoming meetings scheduled.
          </Text>
        )}
      </View>

      {/* Secretary Tips */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Secretary Responsibilities</Text>
        {[
          {
            icon: 'book-open-variant',
            text: 'Keep accurate records of meetings and decisions',
          },
          {
            icon: 'account-group',
            text: 'Track attendance and sobriety anniversaries',
          },
          {
            icon: 'currency-usd',
            text: 'Record 7th tradition amounts in treasury after each meeting',
          },
          {
            icon: 'bullhorn',
            text: 'Post announcements and upcoming event information',
          },
          {
            icon: 'calendar-edit',
            text: 'Coordinate with chairperson for meeting formats',
          },
        ].map((tip, index) => (
          <View key={index} style={styles.tipRow}>
            <Icon
              name={tip.icon}
              size={18}
              color="#7B1FA2"
              style={{marginRight: 10, marginTop: 1}}
            />
            <Text style={styles.tipText}>{tip.text}</Text>
          </View>
        ))}
      </View>

      <View style={{height: 32}} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  pageHeader: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  pageHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginTop: 8,
  },
  pageHeaderSubtitle: {
    fontSize: 14,
    color: '#757575',
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#FFFFFF',
    margin: 12,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9E9E9E',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 12,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E5F5',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#CE93D8',
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4A148C',
  },
  quickActionSubtitle: {
    fontSize: 13,
    color: '#7B1FA2',
    marginTop: 2,
  },
  quickActionButtonSecondary: {
    marginTop: 12,
    backgroundColor: '#E3F2FD',
    borderColor: '#90CAF9',
  },
  quickActionIconSecondary: {
    backgroundColor: '#FFFFFF',
  },
  quickActionTitleSecondary: {
    color: '#1565C0',
  },
  quickActionSubtitleSecondary: {
    color: '#1976D2',
  },
  meetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  meetingRowLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  meetingRowName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
  },
  meetingRowDate: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  meetingRowLocation: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 1,
  },
  meetingRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  startChecklistLabel: {
    fontSize: 13,
    color: '#7B1FA2',
    fontWeight: '600',
    marginRight: 2,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: '#424242',
    lineHeight: 20,
  },
});

export default SecretaryToolkitScreen;
