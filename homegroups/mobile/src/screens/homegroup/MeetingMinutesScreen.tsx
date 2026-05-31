import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import {GroupStackParamList} from '../../types/navigation';
import {MeetingMinutesDocument} from '../../types/schema';
import {useAppSelector} from '../../store';
import {selectGroupById} from '../../store/slices/groupsSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';
import {MeetingMinutesReportService} from '../../services/reports/MeetingMinutesReportService';

type MeetingMinutesRouteProp = RouteProp<GroupStackParamList, 'MeetingMinutes'>;
type MeetingMinutesNavigationProp = StackNavigationProp<GroupStackParamList>;

const MeetingMinutesScreen: React.FC = () => {
  const route = useRoute<MeetingMinutesRouteProp>();
  const navigation = useNavigation<MeetingMinutesNavigationProp>();
  const {groupId, groupName, businessMeetingId, meetingDate} = route.params;
  const currentUser = auth().currentUser;

  const group = useAppSelector(state => selectGroupById(state, groupId));
  const isAdmin = group?.admins?.includes(currentUser?.uid || '') ?? false;

  const [minutes, setMinutes] = useState<MeetingMinutesDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [sharingPDF, setSharingPDF] = useState(false);

  const dateLabel = format(new Date(meetingDate), 'MMM d, yyyy');

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const doc = await firestore()
        .collection('business_meetings')
        .doc(businessMeetingId)
        .collection('minutes')
        .doc('record')
        .get();

      if (doc.exists) {
        setMinutes(doc.data() as MeetingMinutesDocument);
      } else {
        setMinutes(null);
      }
    } catch (error) {
      console.error('Error loading minutes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessMeetingId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    navigation.setOptions({
      title: `Minutes — ${dateLabel}`,
      headerRight: () => (
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() =>
              navigation.navigate('EditMeetingMinutes', {
                groupId,
                groupName,
                businessMeetingId,
                meetingDate,
              })
            }
            testID="edit-minutes-header-button">
            <Icon name="pencil" size={20} color="#2196F3" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleSharePDF}
            disabled={sharingPDF}
            testID="share-minutes-pdf-button">
            {sharingPDF ? (
              <ActivityIndicator size="small" color="#2196F3" />
            ) : (
              <Icon name="file-pdf-box" size={20} color="#2196F3" />
            )}
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, dateLabel, sharingPDF, minutes]);

  const handleSharePDF = async () => {
    if (!minutes) return;
    setSharingPDF(true);
    try {
      await MeetingMinutesReportService.generateAndShare(minutes, groupName);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate PDF.');
    } finally {
      setSharingPDF(false);
    }
  };

  const handleApprove = () => {
    Alert.alert(
      'Approve Minutes',
      'Approve these minutes? This will notify all group members.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Approve',
          onPress: async () => {
            setApproving(true);
            try {
              const approveFn = functions().httpsCallable('approveMeetingMinutes');
              await approveFn({businessMeetingId, groupId});
              Alert.alert('Success', 'Minutes approved and members notified.');
              await loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to approve minutes.');
            } finally {
              setApproving(false);
            }
          },
        },
      ],
    );
  };

  const formatCurrency = (n: number) => `$${n.toFixed(2)}`;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!minutes) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="notebook-outline" size={56} color="#BDBDBD" />
        <Text style={styles.emptyTitle}>No Minutes Yet</Text>
        <Text style={styles.emptySubtitle}>
          No minutes have been recorded for this meeting.
        </Text>
        <TouchableOpacity
          style={styles.recordButton}
          onPress={() =>
            navigation.navigate('EditMeetingMinutes', {
              groupId,
              groupName,
              businessMeetingId,
              meetingDate,
            })
          }
          testID="record-minutes-button">
          <Icon name="plus" size={18} color="#FFF" style={{marginRight: 8}} />
          <Text style={styles.recordButtonText}>Record Minutes</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={loadData} />
      }
      testID="meeting-minutes-screen">
      {/* Status Badge */}
      <View style={styles.statusBar}>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                minutes.status === 'approved' ? '#4CAF50' : '#FF9800',
            },
          ]}>
          <Text style={styles.statusBadgeText}>
            {minutes.status === 'approved' ? 'APPROVED' : 'DRAFT'}
          </Text>
        </View>
      </View>

      {/* Meeting Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Meeting Info</Text>
        <View style={styles.infoGrid}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Chair</Text>
            <Text style={styles.infoValue}>{minutes.chair || '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Secretary</Text>
            <Text style={styles.infoValue}>{minutes.secretary || '—'}</Text>
          </View>
          {minutes.openedAt && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Opened</Text>
              <Text style={styles.infoValue}>{minutes.openedAt}</Text>
            </View>
          )}
          {minutes.closedAt && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Closed</Text>
              <Text style={styles.infoValue}>{minutes.closedAt}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Attendance</Text>
            <Text style={styles.infoValue}>
              {minutes.attendanceCount} members
              {minutes.memberQuorum ? ' · Quorum met' : ' · No quorum'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Prayer</Text>
            <Text style={styles.infoValue}>
              Opening: {minutes.openingPrayer ? 'Yes' : 'No'} · Closing:{' '}
              {minutes.closingPrayer ? 'Yes' : 'No'}
            </Text>
          </View>
        </View>
      </View>

      {/* Treasury Report */}
      {minutes.treasuryReport && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Treasury Report</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Opening Balance</Text>
              <Text style={styles.infoValue}>
                {formatCurrency(minutes.treasuryReport.openingBalance)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>7th Tradition</Text>
              <Text style={styles.infoValue}>
                {formatCurrency(minutes.treasuryReport.collection7thTradition)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Expenses</Text>
              <Text style={styles.infoValue}>
                {formatCurrency(minutes.treasuryReport.expenses)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Closing Balance</Text>
              <Text style={[styles.infoValue, {fontWeight: '700'}]}>
                {formatCurrency(minutes.treasuryReport.closingBalance)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Prudent Reserve</Text>
              <Text style={styles.infoValue}>
                {formatCurrency(minutes.treasuryReport.prudentReserve)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Agenda Items */}
      {minutes.agendaItems && minutes.agendaItems.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Agenda Items ({minutes.agendaItems.length})
          </Text>
          {minutes.agendaItems.map((item, idx) => (
            <View key={idx} style={styles.agendaItem}>
              <View style={styles.agendaItemHeader}>
                <Text style={styles.agendaItemTitle}>{item.title}</Text>
                <View
                  style={[
                    styles.outcomeBadge,
                    {
                      backgroundColor:
                        item.outcome === 'voted'
                          ? '#4CAF50'
                          : item.outcome === 'tabled'
                          ? '#FF9800'
                          : '#9E9E9E',
                    },
                  ]}>
                  <Text style={styles.outcomeBadgeText}>
                    {item.outcome.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
              </View>
              {item.notes ? (
                <Text style={styles.agendaItemNotes}>{item.notes}</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {/* Decisions */}
      {minutes.decisions && minutes.decisions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Decisions ({minutes.decisions.length})
          </Text>
          {minutes.decisions.map((decision, idx) => (
            <View key={idx} style={styles.decisionItem}>
              <View style={styles.decisionHeader}>
                <Text style={styles.decisionTopic}>{decision.topic}</Text>
                <View
                  style={[
                    styles.passedBadge,
                    {
                      backgroundColor: decision.passed
                        ? '#4CAF50'
                        : '#F44336',
                    },
                  ]}>
                  <Text style={styles.passedBadgeText}>
                    {decision.passed ? 'PASSED' : 'FAILED'}
                  </Text>
                </View>
              </View>
              <Text style={styles.motionText}>{decision.motionText}</Text>
              <Text style={styles.voteTally}>
                For: {decision.voteFor} · Against: {decision.voteAgainst} ·
                Abstain: {decision.voteAbstain}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Next Meeting */}
      {(minutes.nextMeetingDate || minutes.nextMeetingLocation) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next Meeting</Text>
          {minutes.nextMeetingDate && (
            <Text style={styles.nextMeetingText}>
              {(() => {
                try {
                  const d =
                    typeof minutes.nextMeetingDate?.toDate === 'function'
                      ? minutes.nextMeetingDate.toDate()
                      : new Date(minutes.nextMeetingDate as any);
                  return format(d, 'MMM d, yyyy');
                } catch {
                  return 'TBD';
                }
              })()}
            </Text>
          )}
          {minutes.nextMeetingLocation && (
            <Text style={styles.nextMeetingText}>
              {minutes.nextMeetingLocation}
            </Text>
          )}
        </View>
      )}

      {/* Approve Button */}
      {isAdmin && minutes.status === 'draft' && (
        <TouchableOpacity
          style={styles.approveButton}
          onPress={handleApprove}
          disabled={approving}
          testID="approve-minutes-button">
          {approving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Icon
                name="check-circle"
                size={18}
                color="#FFF"
                style={{marginRight: 8}}
              />
              <Text style={styles.approveButtonText}>Approve Minutes</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <View style={{height: 32}} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  loadingContainer: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 24,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  recordButtonText: {color: '#FFF', fontWeight: '600', fontSize: 15},
  headerButtons: {flexDirection: 'row', marginRight: 8},
  headerButton: {padding: 6, marginLeft: 4},
  statusBar: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadgeText: {color: '#FFF', fontSize: 12, fontWeight: '700'},
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
  infoGrid: {},
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  infoLabel: {fontSize: 14, color: '#757575'},
  infoValue: {fontSize: 14, color: '#212121', flexShrink: 1, textAlign: 'right'},
  agendaItem: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  agendaItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  agendaItemTitle: {fontSize: 14, fontWeight: '600', color: '#212121', flex: 1},
  outcomeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginLeft: 8,
  },
  outcomeBadgeText: {fontSize: 10, color: '#FFF', fontWeight: '700'},
  agendaItemNotes: {fontSize: 13, color: '#616161', lineHeight: 18},
  decisionItem: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  decisionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  decisionTopic: {fontSize: 14, fontWeight: '600', color: '#212121', flex: 1},
  passedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 8,
  },
  passedBadgeText: {fontSize: 11, color: '#FFF', fontWeight: '700'},
  motionText: {fontSize: 13, color: '#616161', fontStyle: 'italic', marginBottom: 4},
  voteTally: {fontSize: 12, color: '#9E9E9E'},
  nextMeetingText: {fontSize: 14, color: '#212121', marginBottom: 4},
  approveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 8,
    paddingVertical: 14,
  },
  approveButtonText: {color: '#FFF', fontWeight: '600', fontSize: 15},
});

export default MeetingMinutesScreen;
