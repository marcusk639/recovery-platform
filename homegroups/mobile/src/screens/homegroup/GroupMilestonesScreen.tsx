import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  Share,
  RefreshControl,
} from 'react-native';
import {RouteProp, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useNavigation} from '@react-navigation/native';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {GroupStackParamList} from '../../types/navigation';
import {generateAnniversaryCardHTML} from '../../components/milestones/AnniversaryCard';

type GroupMilestonesRouteProp = RouteProp<GroupStackParamList, 'GroupMilestones'>;
type GroupMilestonesNavigationProp = StackNavigationProp<GroupStackParamList>;

/** Threshold array — used to populate the milestone picker */
const MILESTONE_THRESHOLDS = [30, 60, 90, 180, 270, 365, 730, 1095, 1460, 1825];

interface MilestoneRecord {
  days: number;
  chipGivenAt: string; // ISO string
  chipGivenBy: string;
  notes?: string;
}

interface MilestoneDoc {
  memberId: string;
  userId: string;
  displayName: string;
  sobrietyDate: string;
  milestones: MilestoneRecord[];
  nextMilestoneDate?: string;
  nextMilestoneDays?: number;
}

interface RecentRecord extends MilestoneRecord {
  memberId: string;
  displayName: string;
}

interface MilestonesData {
  all: MilestoneDoc[];
  upcoming: MilestoneDoc[];
  recent: RecentRecord[];
}

const EMPTY_DATA: MilestonesData = {all: [], upcoming: [], recent: []};

const GroupMilestonesScreen: React.FC = () => {
  const route = useRoute<GroupMilestonesRouteProp>();
  const navigation = useNavigation<GroupMilestonesNavigationProp>();
  const {groupId, groupName} = route.params;
  const currentUser = auth().currentUser;

  const [data, setData] = useState<MilestonesData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Record chip modal state
  const [recordModalVisible, setRecordModalVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MilestoneDoc | null>(null);
  const [selectedDays, setSelectedDays] = useState<number>(30);
  const [sobrietyDateInput, setSobrietyDateInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [recording, setRecording] = useState(false);

  // Share card state
  const [sharingMilestone, setSharingMilestone] = useState<{
    doc: MilestoneDoc;
    record: MilestoneRecord;
  } | null>(null);
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [cardAnonymous, setCardAnonymous] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const getMilestones = functions().httpsCallable('getMilestones');
      const result = await getMilestones({groupId});
      setData(result.data as MilestonesData);
    } catch (error: any) {
      console.error('Error loading milestones:', error);
      Alert.alert('Error', 'Failed to load milestones.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId]);

  // Detect admin status using Firebase Auth token
  const checkAdminStatus = useCallback(async () => {
    if (!currentUser) return;
    try {
      const token = await currentUser.getIdTokenResult(true);
      const adminGroups: string[] = token.claims.adminGroups || [];
      setIsAdmin(adminGroups.includes(groupId));
    } catch {
      setIsAdmin(false);
    }
  }, [currentUser, groupId]);

  useEffect(() => {
    Promise.all([loadData(), checkAdminStatus()]);
  }, [groupId]);

  const formatDate = (isoStr: string): string => {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysLabel = (days: number): string => {
    const yearCount = Math.floor(days / 365);
    if (days >= 365) {
      return `${yearCount} ${yearCount === 1 ? 'Year' : 'Years'}`;
    }
    return `${days} Days`;
  };

  const getDaysUntil = (isoStr: string): number => {
    const target = new Date(isoStr).getTime();
    const now = Date.now();
    return Math.max(0, Math.round((target - now) / (24 * 60 * 60 * 1000)));
  };

  const openRecordModal = (doc: MilestoneDoc) => {
    setSelectedMember(doc);
    // Pre-fill sobrietyDate from existing doc
    if (doc.sobrietyDate) {
      const d = new Date(doc.sobrietyDate);
      setSobrietyDateInput(d.toISOString().split('T')[0]);
    } else {
      setSobrietyDateInput('');
    }
    // Default days to nextMilestoneDays if available
    setSelectedDays(doc.nextMilestoneDays || 30);
    setNotesInput('');
    setRecordModalVisible(true);
  };

  const openRecordModalForNew = () => {
    setSelectedMember(null);
    setSobrietyDateInput('');
    setSelectedDays(30);
    setNotesInput('');
    setRecordModalVisible(true);
  };

  const handleRecordMilestone = async () => {
    if (!selectedMember && !sobrietyDateInput) {
      Alert.alert('Required', 'Please select a member and enter their sobriety date.');
      return;
    }

    // Build memberId from group_members format
    const memberId = selectedMember
      ? selectedMember.memberId
      : undefined;

    if (!memberId) {
      Alert.alert('Error', 'Could not determine member ID.');
      return;
    }

    setRecording(true);
    try {
      const recordMilestone = functions().httpsCallable('recordMilestone');
      await recordMilestone({
        groupId,
        memberId,
        days: selectedDays,
        sobrietyDate: sobrietyDateInput || undefined,
        notes: notesInput.trim() || undefined,
      });

      setRecordModalVisible(false);

      // Offer to share anniversary card
      if (selectedMember) {
        setSharingMilestone({
          doc: selectedMember,
          record: {
            days: selectedDays,
            chipGivenAt: new Date().toISOString(),
            chipGivenBy: currentUser?.uid || '',
            notes: notesInput || undefined,
          },
        });
        setCardModalVisible(true);
      }

      await loadData();
      Alert.alert('Success', `${getDaysLabel(selectedDays)} milestone recorded!`);
    } catch (error: any) {
      console.error('Error recording milestone:', error);
      Alert.alert('Error', error.message || 'Failed to record milestone.');
    } finally {
      setRecording(false);
    }
  };

  const handleShareCard = async () => {
    if (!sharingMilestone) return;
    const {doc, record} = sharingMilestone;
    const celebrationDate = new Date(record.chipGivenAt);

    try {
      const html = generateAnniversaryCardHTML(
        groupName,
        doc.displayName,
        record.days,
        celebrationDate,
        cardAnonymous,
      );

      const daysLabel = getDaysLabel(record.days);
      const pdf = await RNHTMLtoPDF.convert({
        html,
        fileName: `${groupName.replace(/[^a-z0-9]/gi, '_')}_${record.days}day_anniversary`,
        directory: Platform.OS === 'ios' ? 'Documents' : 'Downloads',
      });

      if (pdf?.filePath) {
        await Share.share({
          title: `${daysLabel} of Recovery`,
          url: Platform.OS === 'ios' ? `file://${pdf.filePath}` : pdf.filePath,
          message:
            Platform.OS === 'android'
              ? `Celebrating ${daysLabel} of Recovery!`
              : undefined,
        });
      }
    } catch (error: any) {
      console.error('Error sharing anniversary card:', error);
      Alert.alert('Error', 'Failed to generate anniversary card.');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#C9A84C" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadData} />
        }
        testID="milestones-scroll">

        {/* Upcoming Milestones Section */}
        <View style={styles.section} testID="upcoming-milestones-section">
          <View style={styles.sectionHeader}>
            <Icon name="calendar-star" size={20} color="#C9A84C" />
            <Text style={styles.sectionTitle}>Upcoming Milestones</Text>
          </View>

          {data.upcoming.length === 0 ? (
            <Text style={styles.emptyText}>No milestones in the next 30 days</Text>
          ) : (
            data.upcoming.map(doc => {
              const daysUntil = doc.nextMilestoneDate
                ? getDaysUntil(doc.nextMilestoneDate)
                : null;
              return (
                <TouchableOpacity
                  key={doc.memberId}
                  style={styles.milestoneRow}
                  onPress={() => isAdmin && openRecordModal(doc)}
                  disabled={!isAdmin}
                  testID={`upcoming-milestone-${doc.memberId}`}>
                  <View style={styles.milestoneIcon}>
                    <Icon name="medal" size={28} color="#C9A84C" />
                  </View>
                  <View style={styles.milestoneInfo}>
                    <Text style={styles.milestoneName}>{doc.displayName}</Text>
                    {doc.nextMilestoneDays !== undefined && (
                      <Text style={styles.milestoneDays}>
                        {getDaysLabel(doc.nextMilestoneDays)}
                      </Text>
                    )}
                    {daysUntil !== null && (
                      <Text style={styles.milestoneDate}>
                        {daysUntil === 0
                          ? 'Today!'
                          : `In ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`}
                      </Text>
                    )}
                  </View>
                  {isAdmin && (
                    <View style={styles.recordChip}>
                      <Icon name="plus-circle" size={20} color="#C9A84C" />
                      <Text style={styles.recordChipText}>Record</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Recent Chips Section */}
        <View style={styles.section} testID="recent-chips-section">
          <View style={styles.sectionHeader}>
            <Icon name="history" size={20} color="#2196F3" />
            <Text style={styles.sectionTitle}>Recent Chips</Text>
          </View>

          {data.recent.length === 0 ? (
            <Text style={styles.emptyText}>No chips recorded yet</Text>
          ) : (
            data.recent.map((record, idx) => (
              <View
                key={`${record.memberId}-${record.chipGivenAt}-${idx}`}
                style={styles.recentRow}
                testID={`recent-chip-${idx}`}>
                <View style={styles.recentIcon}>
                  <Text style={styles.recentIconText}>🏅</Text>
                </View>
                <View style={styles.recentInfo}>
                  <Text style={styles.recentName}>
                    {record.displayName} — {getDaysLabel(record.days)}
                  </Text>
                  <Text style={styles.recentDate}>
                    {formatDate(record.chipGivenAt)}
                  </Text>
                  {record.notes && (
                    <Text style={styles.recentNotes}>{record.notes}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* FAB for admins */}
      {isAdmin && (
        <TouchableOpacity
          style={styles.fab}
          onPress={openRecordModalForNew}
          testID="milestones-fab">
          <Icon name="plus" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Record Milestone Modal */}
      <Modal
        visible={recordModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRecordModalVisible(false)}
        testID="record-milestone-modal">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Record Milestone Chip</Text>

            {/* Member selector - simplified: show current member or note */}
            {selectedMember && (
              <View style={styles.modalMemberRow}>
                <Icon name="account" size={20} color="#2196F3" />
                <Text style={styles.modalMemberName}>{selectedMember.displayName}</Text>
              </View>
            )}

            {/* Milestone days picker */}
            <Text style={styles.modalLabel}>Milestone</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.thresholdScroll}>
              {MILESTONE_THRESHOLDS.map(threshold => (
                <TouchableOpacity
                  key={threshold}
                  style={[
                    styles.thresholdChip,
                    selectedDays === threshold && styles.thresholdChipSelected,
                  ]}
                  onPress={() => setSelectedDays(threshold)}>
                  <Text
                    style={[
                      styles.thresholdChipText,
                      selectedDays === threshold &&
                        styles.thresholdChipTextSelected,
                    ]}>
                    {getDaysLabel(threshold)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Sobriety date (required for first chip) */}
            <Text style={styles.modalLabel}>
              Sobriety Date{' '}
              <Text style={styles.modalLabelHint}>(YYYY-MM-DD)</Text>
            </Text>
            <TextInput
              style={styles.modalInput}
              value={sobrietyDateInput}
              onChangeText={setSobrietyDateInput}
              placeholder="e.g. 2021-03-15"
              placeholderTextColor="#BDBDBD"
              testID="sobriety-date-input"
            />

            {/* Optional notes */}
            <Text style={styles.modalLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.modalInput, styles.notesInput]}
              value={notesInput}
              onChangeText={setNotesInput}
              placeholder="Any notes about the chip ceremony..."
              placeholderTextColor="#BDBDBD"
              multiline
              numberOfLines={3}
              testID="notes-input"
            />

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setRecordModalVisible(false)}
                disabled={recording}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitButton, recording && styles.submitButtonDisabled]}
                onPress={handleRecordMilestone}
                disabled={recording}
                testID="record-milestone-submit">
                {recording ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Record Chip</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Anniversary Card Share Modal */}
      <Modal
        visible={cardModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCardModalVisible(false)}
        testID="share-card-modal">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Share Anniversary Card</Text>

            {sharingMilestone && (
              <View style={styles.cardPreview}>
                <View style={styles.cardPreviewInner}>
                  <View style={styles.cardAccent} />
                  <Text style={styles.cardGroupName}>{groupName}</Text>
                  <Text style={styles.cardCelebrating}>CELEBRATING</Text>
                  <Text style={styles.cardDays}>
                    {getDaysLabel(sharingMilestone.record.days)}
                  </Text>
                  <Text style={styles.cardSubtitle}>OF RECOVERY</Text>
                  <Text style={styles.cardMemberName}>
                    {cardAnonymous
                      ? `A Member of ${groupName}`
                      : sharingMilestone.doc.displayName}
                  </Text>
                  <View style={styles.cardAccent} />
                </View>
              </View>
            )}

            {/* Anonymous option */}
            <TouchableOpacity
              style={styles.anonymousToggle}
              onPress={() => setCardAnonymous(prev => !prev)}>
              <Icon
                name={cardAnonymous ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={20}
                color="#2196F3"
              />
              <Text style={styles.anonymousText}>Share anonymously</Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setCardModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleShareCard}
                testID="share-card-button">
                <Icon
                  name="share-variant"
                  size={16}
                  color="#FFFFFF"
                  style={{marginRight: 6}}
                />
                <Text style={styles.submitButtonText}>Share Card</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const GOLD = '#C9A84C';
const DARK_GOLD = '#8B6914';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 80,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    margin: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  emptyText: {
    fontSize: 14,
    color: '#9E9E9E',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: GOLD,
  },
  milestoneIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF3CD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  milestoneInfo: {
    flex: 1,
  },
  milestoneName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 2,
  },
  milestoneDays: {
    fontSize: 14,
    color: DARK_GOLD,
    fontWeight: '600',
  },
  milestoneDate: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  recordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  recordChipText: {
    fontSize: 13,
    color: GOLD,
    fontWeight: '600',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recentIconText: {
    fontSize: 18,
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
  },
  recentDate: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  recentNotes: {
    fontSize: 13,
    color: '#9E9E9E',
    fontStyle: 'italic',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GOLD,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 500,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 16,
  },
  modalMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    gap: 8,
  },
  modalMemberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1565C0',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#424242',
    marginBottom: 6,
  },
  modalLabelHint: {
    fontWeight: '400',
    color: '#9E9E9E',
    fontSize: 12,
  },
  thresholdScroll: {
    marginBottom: 14,
    flexGrow: 0,
  },
  thresholdChip: {
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 8,
  },
  thresholdChipSelected: {
    backgroundColor: GOLD,
  },
  thresholdChipText: {
    fontSize: 13,
    color: DARK_GOLD,
    fontWeight: '600',
  },
  thresholdChipTextSelected: {
    color: '#FFFFFF',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#212121',
    marginBottom: 14,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#757575',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: GOLD,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  submitButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  // Card preview
  cardPreview: {
    marginBottom: 16,
    alignItems: 'center',
  },
  cardPreviewInner: {
    backgroundColor: '#FFF8E7',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: GOLD,
    padding: 20,
    alignItems: 'center',
    width: '100%',
  },
  cardAccent: {
    width: 48,
    height: 3,
    backgroundColor: GOLD,
    borderRadius: 2,
    marginVertical: 6,
  },
  cardGroupName: {
    fontSize: 11,
    fontWeight: '600',
    color: DARK_GOLD,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  cardCelebrating: {
    fontSize: 10,
    color: DARK_GOLD,
    letterSpacing: 2,
    marginTop: 10,
    marginBottom: 2,
  },
  cardDays: {
    fontSize: 32,
    fontWeight: '800',
    color: DARK_GOLD,
  },
  cardSubtitle: {
    fontSize: 12,
    color: DARK_GOLD,
    letterSpacing: 1,
    marginBottom: 10,
  },
  cardMemberName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3D2B1F',
  },
  anonymousToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  anonymousText: {
    fontSize: 14,
    color: '#424242',
  },
});

export default GroupMilestonesScreen;
