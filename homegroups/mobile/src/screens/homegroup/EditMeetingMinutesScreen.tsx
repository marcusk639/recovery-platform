import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Switch,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import {GroupStackParamList} from '../../types/navigation';
import {
  MeetingMinutesDocument,
  MinutesAgendaEntry,
  MinutesDecisionEntry,
} from '../../types/schema';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';

type EditMeetingMinutesRouteProp = RouteProp<
  GroupStackParamList,
  'EditMeetingMinutes'
>;
type EditMeetingMinutesNavigationProp =
  StackNavigationProp<GroupStackParamList>;

const OUTCOME_OPTIONS: MinutesAgendaEntry['outcome'][] = [
  'no_action',
  'voted',
  'tabled',
  'information_only',
];

const EditMeetingMinutesScreen: React.FC = () => {
  const route = useRoute<EditMeetingMinutesRouteProp>();
  const navigation = useNavigation<EditMeetingMinutesNavigationProp>();
  const {groupId, groupName, businessMeetingId, meetingDate} = route.params;
  const currentUser = auth().currentUser;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [chair, setChair] = useState('');
  const [secretary, setSecretary] = useState('');
  const [attendanceCount, setAttendanceCount] = useState('0');
  const [memberQuorum, setMemberQuorum] = useState(false);
  const [openedAt, setOpenedAt] = useState('');
  const [closedAt, setClosedAt] = useState('');
  const [openingPrayer, setOpeningPrayer] = useState(true);
  const [closingPrayer, setClosingPrayer] = useState(true);

  // Treasury
  const [openingBalance, setOpeningBalance] = useState('');
  const [collection7th, setCollection7th] = useState('');
  const [expenses, setExpenses] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [prudentReserve, setPrudentReserve] = useState('');
  const [treasuryNotes, setTreasuryNotes] = useState('');

  const [agendaItems, setAgendaItems] = useState<MinutesAgendaEntry[]>([]);
  const [decisions, setDecisions] = useState<MinutesDecisionEntry[]>([]);
  const [nextMeetingLocation, setNextMeetingLocation] = useState('');
  const [announcements, setAnnouncements] = useState('');

  const dateLabel = format(new Date(meetingDate), 'MMM d, yyyy');

  const loadExistingMinutes = useCallback(async () => {
    try {
      const doc = await firestore()
        .collection('business_meetings')
        .doc(businessMeetingId)
        .collection('minutes')
        .doc('record')
        .get();

      if (doc.exists) {
        const data = doc.data() as MeetingMinutesDocument;
        setChair(data.chair || '');
        setSecretary(data.secretary || '');
        setAttendanceCount(String(data.attendanceCount || 0));
        setMemberQuorum(data.memberQuorum || false);
        setOpenedAt(data.openedAt || '');
        setClosedAt(data.closedAt || '');
        setOpeningPrayer(data.openingPrayer !== false);
        setClosingPrayer(data.closingPrayer !== false);
        if (data.treasuryReport) {
          setOpeningBalance(String(data.treasuryReport.openingBalance || ''));
          setCollection7th(
            String(data.treasuryReport.collection7thTradition || ''),
          );
          setExpenses(String(data.treasuryReport.expenses || ''));
          setClosingBalance(String(data.treasuryReport.closingBalance || ''));
          setPrudentReserve(String(data.treasuryReport.prudentReserve || ''));
          setTreasuryNotes(data.treasuryReport.notes || '');
        }
        setAgendaItems(data.agendaItems || []);
        setDecisions(data.decisions || []);
        setNextMeetingLocation(data.nextMeetingLocation || '');
        setAnnouncements(data.announcements || '');
      } else {
        // Pre-fill secretary with current user name
        const userDoc = currentUser
          ? await firestore().collection('users').doc(currentUser.uid).get()
          : null;
        if (userDoc?.exists) {
          setSecretary(userDoc.data()?.displayName || '');
        }
      }
    } catch (err) {
      console.error('Error loading existing minutes:', err);
    } finally {
      setLoading(false);
    }
  }, [businessMeetingId, currentUser]);

  useEffect(() => {
    loadExistingMinutes();
  }, [loadExistingMinutes]);

  useEffect(() => {
    navigation.setOptions({
      title: `Record Minutes — ${dateLabel}`,
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleSave}
          disabled={saving}
          testID="save-minutes-header-button">
          {saving ? (
            <ActivityIndicator size="small" color="#2196F3" />
          ) : (
            <Text style={styles.headerSaveText}>Save</Text>
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, saving, chair, secretary, attendanceCount]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saveFn = functions().httpsCallable('saveMeetingMinutes');

      const hasTreasury =
        openingBalance || collection7th || expenses || closingBalance;

      await saveFn({
        businessMeetingId,
        groupId,
        minutes: {
          chair,
          secretary,
          attendanceCount: parseInt(attendanceCount, 10) || 0,
          memberQuorum,
          openedAt: openedAt || undefined,
          closedAt: closedAt || undefined,
          openingPrayer,
          closingPrayer,
          treasuryReport: hasTreasury
            ? {
                openingBalance: parseFloat(openingBalance) || 0,
                collection7thTradition: parseFloat(collection7th) || 0,
                expenses: parseFloat(expenses) || 0,
                closingBalance: parseFloat(closingBalance) || 0,
                prudentReserve: parseFloat(prudentReserve) || 0,
                notes: treasuryNotes || undefined,
              }
            : undefined,
          agendaItems,
          decisions,
          nextMeetingLocation: nextMeetingLocation || undefined,
          announcements: announcements || undefined,
        },
      });

      Alert.alert('Draft Saved', 'Meeting minutes saved as draft.', [
        {
          text: 'OK',
          onPress: () =>
            navigation.navigate('MeetingMinutes', {
              groupId,
              groupName,
              businessMeetingId,
              meetingDate,
            }),
        },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save minutes.');
    } finally {
      setSaving(false);
    }
  };

  const addAgendaItem = () => {
    setAgendaItems([
      ...agendaItems,
      {
        itemId: `item_${Date.now()}`,
        title: '',
        notes: '',
        outcome: 'no_action',
      },
    ]);
  };

  const updateAgendaItem = (
    idx: number,
    field: keyof MinutesAgendaEntry,
    value: any,
  ) => {
    const updated = [...agendaItems];
    (updated[idx] as any)[field] = value;
    setAgendaItems(updated);
  };

  const removeAgendaItem = (idx: number) => {
    setAgendaItems(agendaItems.filter((_, i) => i !== idx));
  };

  const addDecision = () => {
    setDecisions([
      ...decisions,
      {
        topic: '',
        motionText: '',
        movedBy: '',
        secondedBy: '',
        voteFor: 0,
        voteAgainst: 0,
        voteAbstain: 0,
        passed: true,
      },
    ]);
  };

  const updateDecision = (
    idx: number,
    field: keyof MinutesDecisionEntry,
    value: any,
  ) => {
    const updated = [...decisions];
    (updated[idx] as any)[field] = value;
    setDecisions(updated);
  };

  const removeDecision = (idx: number) => {
    setDecisions(decisions.filter((_, i) => i !== idx));
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="edit-meeting-minutes-screen">
      {/* Meeting Info Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Meeting Info</Text>
        <Text style={styles.fieldLabel}>Chair</Text>
        <TextInput
          style={styles.textInput}
          value={chair}
          onChangeText={setChair}
          placeholder="Chair name"
          placeholderTextColor="#9E9E9E"
        />
        <Text style={styles.fieldLabel}>Secretary</Text>
        <TextInput
          style={styles.textInput}
          value={secretary}
          onChangeText={setSecretary}
          placeholder="Secretary name"
          placeholderTextColor="#9E9E9E"
        />
        <Text style={styles.fieldLabel}>Attendance Count</Text>
        <TextInput
          style={styles.textInput}
          value={attendanceCount}
          onChangeText={setAttendanceCount}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor="#9E9E9E"
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Quorum met</Text>
          <Switch value={memberQuorum} onValueChange={setMemberQuorum} />
        </View>
        <Text style={styles.fieldLabel}>Opened at</Text>
        <TextInput
          style={styles.textInput}
          value={openedAt}
          onChangeText={setOpenedAt}
          placeholder="7:32 PM"
          placeholderTextColor="#9E9E9E"
        />
        <Text style={styles.fieldLabel}>Closed at</Text>
        <TextInput
          style={styles.textInput}
          value={closedAt}
          onChangeText={setClosedAt}
          placeholder="8:15 PM"
          placeholderTextColor="#9E9E9E"
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Opening prayer</Text>
          <Switch value={openingPrayer} onValueChange={setOpeningPrayer} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Closing prayer</Text>
          <Switch value={closingPrayer} onValueChange={setClosingPrayer} />
        </View>
      </View>

      {/* Treasury Report Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Treasury Report</Text>
        {[
          ['Opening Balance', openingBalance, setOpeningBalance],
          ['7th Tradition', collection7th, setCollection7th],
          ['Expenses', expenses, setExpenses],
          ['Closing Balance', closingBalance, setClosingBalance],
          ['Prudent Reserve', prudentReserve, setPrudentReserve],
        ].map(([label, value, setter]) => (
          <View key={label as string}>
            <Text style={styles.fieldLabel}>{label as string}</Text>
            <TextInput
              style={styles.textInput}
              value={value as string}
              onChangeText={setter as (v: string) => void}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#9E9E9E"
            />
          </View>
        ))}
        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput
          style={[styles.textInput, styles.textAreaInput]}
          value={treasuryNotes}
          onChangeText={setTreasuryNotes}
          placeholder="Optional notes..."
          placeholderTextColor="#9E9E9E"
          multiline
        />
      </View>

      {/* Agenda Items Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Agenda Items</Text>
        {agendaItems.map((item, idx) => (
          <View key={item.itemId} style={styles.itemCard}>
            <View style={styles.itemCardHeader}>
              <Text style={styles.itemCardLabel}>Item {idx + 1}</Text>
              <TouchableOpacity onPress={() => removeAgendaItem(idx)}>
                <Icon name="close" size={18} color="#9E9E9E" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.textInput}
              value={item.title}
              onChangeText={v => updateAgendaItem(idx, 'title', v)}
              placeholder="Title"
              placeholderTextColor="#9E9E9E"
            />
            <TextInput
              style={[styles.textInput, styles.textAreaInput]}
              value={item.notes}
              onChangeText={v => updateAgendaItem(idx, 'notes', v)}
              placeholder="Notes..."
              placeholderTextColor="#9E9E9E"
              multiline
            />
            <View style={styles.outcomeRow}>
              {OUTCOME_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.outcomePill,
                    item.outcome === opt && styles.outcomePillSelected,
                  ]}
                  onPress={() => updateAgendaItem(idx, 'outcome', opt)}>
                  <Text
                    style={[
                      styles.outcomePillText,
                      item.outcome === opt && styles.outcomePillTextSelected,
                    ]}>
                    {opt.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
        <TouchableOpacity
          style={styles.addButton}
          onPress={addAgendaItem}
          testID="add-agenda-item-button">
          <Icon name="plus" size={16} color="#2196F3" style={{marginRight: 6}} />
          <Text style={styles.addButtonText}>Add Agenda Item</Text>
        </TouchableOpacity>
      </View>

      {/* Decisions Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Decisions / Votes</Text>
        {decisions.map((decision, idx) => (
          <View key={idx} style={styles.itemCard}>
            <View style={styles.itemCardHeader}>
              <Text style={styles.itemCardLabel}>Decision {idx + 1}</Text>
              <TouchableOpacity onPress={() => removeDecision(idx)}>
                <Icon name="close" size={18} color="#9E9E9E" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.textInput}
              value={decision.topic}
              onChangeText={v => updateDecision(idx, 'topic', v)}
              placeholder="Topic"
              placeholderTextColor="#9E9E9E"
            />
            <TextInput
              style={[styles.textInput, styles.textAreaInput]}
              value={decision.motionText}
              onChangeText={v => updateDecision(idx, 'motionText', v)}
              placeholder="It was moved by... and seconded by... that..."
              placeholderTextColor="#9E9E9E"
              multiline
            />
            <View style={styles.voteCountRow}>
              {(['voteFor', 'voteAgainst', 'voteAbstain'] as const).map(
                field => (
                  <View key={field} style={styles.voteCountItem}>
                    <Text style={styles.voteCountLabel}>
                      {field === 'voteFor'
                        ? 'For'
                        : field === 'voteAgainst'
                        ? 'Against'
                        : 'Abstain'}
                    </Text>
                    <TextInput
                      style={styles.voteCountInput}
                      value={String(decision[field] || 0)}
                      onChangeText={v =>
                        updateDecision(idx, field, parseInt(v, 10) || 0)
                      }
                      keyboardType="number-pad"
                    />
                  </View>
                ),
              )}
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Passed</Text>
              <Switch
                value={decision.passed}
                onValueChange={v => updateDecision(idx, 'passed', v)}
              />
            </View>
          </View>
        ))}
        <TouchableOpacity
          style={styles.addButton}
          onPress={addDecision}
          testID="add-decision-button">
          <Icon name="plus" size={16} color="#2196F3" style={{marginRight: 6}} />
          <Text style={styles.addButtonText}>Add Decision</Text>
        </TouchableOpacity>
      </View>

      {/* Next Meeting & Announcements */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Next Meeting</Text>
        <Text style={styles.fieldLabel}>Location</Text>
        <TextInput
          style={styles.textInput}
          value={nextMeetingLocation}
          onChangeText={setNextMeetingLocation}
          placeholder="Location..."
          placeholderTextColor="#9E9E9E"
        />
        <Text style={styles.fieldLabel}>Announcements</Text>
        <TextInput
          style={[styles.textInput, styles.textAreaInput]}
          value={announcements}
          onChangeText={setAnnouncements}
          placeholder="Any announcements..."
          placeholderTextColor="#9E9E9E"
          multiline
        />
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={styles.saveButton}
        onPress={handleSave}
        disabled={saving}
        testID="save-minutes-button">
        {saving ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <>
            <Icon
              name="content-save"
              size={18}
              color="#FFF"
              style={{marginRight: 8}}
            />
            <Text style={styles.saveButtonText}>Save Draft</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{height: 40}} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  loadingContainer: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  headerButton: {marginRight: 12, padding: 4},
  headerSaveText: {color: '#2196F3', fontWeight: '600', fontSize: 16},
  section: {
    backgroundColor: '#FFFFFF',
    margin: 12,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: '#212121',
    backgroundColor: '#FAFAFA',
    marginBottom: 4,
  },
  textAreaInput: {minHeight: 70, textAlignVertical: 'top'},
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchLabel: {fontSize: 14, color: '#424242'},
  itemCard: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FAFAFA',
  },
  itemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemCardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#757575',
  },
  outcomeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  outcomePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  outcomePillSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  outcomePillText: {fontSize: 11, color: '#757575'},
  outcomePillTextSelected: {color: '#FFFFFF', fontWeight: '600'},
  voteCountRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  voteCountItem: {flex: 1, alignItems: 'center'},
  voteCountLabel: {fontSize: 12, color: '#757575', marginBottom: 4},
  voteCountInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    textAlign: 'center',
    width: '100%',
    backgroundColor: '#FAFAFA',
    color: '#212121',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 4,
    backgroundColor: '#E3F2FD',
  },
  addButtonText: {color: '#2196F3', fontWeight: '600', fontSize: 14},
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 8,
    paddingVertical: 14,
  },
  saveButtonText: {color: '#FFF', fontWeight: '600', fontSize: 15},
});

export default EditMeetingMinutesScreen;
