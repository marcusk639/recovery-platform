import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import functions from '@react-native-firebase/functions';
import {GroupStackParamList} from '../../types/navigation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type MeetingChecklistRouteProp = RouteProp<
  GroupStackParamList,
  'MeetingChecklist'
>;
type MeetingChecklistNavigationProp = StackNavigationProp<GroupStackParamList>;

// ---------------------------------------------------------------------------
// Checklist data
// ---------------------------------------------------------------------------
interface ChecklistItem {
  id: string;
  label: string;
  section: 'before' | 'during' | 'after';
  tappableAction?: 'addTransaction';
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  // Before meeting
  {
    id: 'lit',
    label: 'Literature available (Big Book, 12&12, daily reader)',
    section: 'before',
  },
  {
    id: 'chips',
    label: 'Chips/medallions ready (30-day, 90-day, 1-year)',
    section: 'before',
  },
  {
    id: 'prayer',
    label: 'Serenity Prayer available',
    section: 'before',
  },
  {
    id: 'coffee',
    label: 'Coffee / refreshments',
    section: 'before',
  },
  {
    id: 'basket',
    label: 'Contribution basket',
    section: 'before',
  },
  // During meeting
  {
    id: 'open_prayer',
    label: 'Open with Serenity Prayer',
    section: 'during',
  },
  {
    id: 'readings',
    label: 'Read How It Works / Preamble',
    section: 'during',
  },
  {
    id: 'announce',
    label: 'Announce upcoming events / anniversaries',
    section: 'during',
  },
  {
    id: 'tradition',
    label: '7th Tradition collected',
    section: 'during',
  },
  {
    id: 'attendance',
    label: 'Mark attendance',
    section: 'during',
  },
  // After meeting
  {
    id: 'record_tradition',
    label: 'Record 7th tradition amount in Treasury',
    section: 'after',
    tappableAction: 'addTransaction',
  },
  {
    id: 'cleanup',
    label: 'Clean up space',
    section: 'after',
  },
  {
    id: 'literature_store',
    label: 'Store literature',
    section: 'after',
  },
];

const SECTION_CONFIG = {
  before: {label: 'Before Meeting', icon: 'clock-outline', color: '#1976D2'},
  during: {label: 'During Meeting', icon: 'account-voice', color: '#388E3C'},
  after: {label: 'After Meeting', icon: 'check-all', color: '#7B1FA2'},
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
const MeetingChecklistScreen: React.FC = () => {
  const route = useRoute<MeetingChecklistRouteProp>();
  const navigation = useNavigation<MeetingChecklistNavigationProp>();
  const {groupId, groupName} = route.params;

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [traditionAmount, setTraditionAmount] = useState('');
  const [addingTransaction, setAddingTransaction] = useState(false);
  const [meetingEnded, setMeetingEnded] = useState(false);

  const toggleItem = (id: string) => {
    setChecked(prev => ({...prev, [id]: !prev[id]}));
  };

  const totalItems = CHECKLIST_ITEMS.length;
  const completedItems = CHECKLIST_ITEMS.filter(item => checked[item.id]).length;
  const progressPct = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  const handleAddToTreasury = async () => {
    const amount = parseFloat(traditionAmount.trim());
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(
        'Invalid Amount',
        'Please enter a valid dollar amount for the 7th tradition.',
      );
      return;
    }

    navigation.navigate('AddTransaction', {groupId, groupName});
  };

  const handleEndMeeting = () => {
    const incomplete = CHECKLIST_ITEMS.filter(item => !checked[item.id]);
    if (incomplete.length > 0) {
      Alert.alert(
        'Incomplete Items',
        `You have ${incomplete.length} unchecked item${incomplete.length === 1 ? '' : 's'}. End meeting anyway?`,
        [
          {text: 'Review', style: 'cancel'},
          {
            text: 'End Meeting',
            onPress: () => {
              setMeetingEnded(true);
              showMeetingSummary();
            },
          },
        ],
      );
    } else {
      setMeetingEnded(true);
      showMeetingSummary();
    }
  };

  const showMeetingSummary = () => {
    Alert.alert(
      'Meeting Complete',
      `Great job! ${completedItems} of ${totalItems} checklist items completed.\n\nRemember to record the 7th tradition amount in the Treasury if you haven't already.`,
      [
        {
          text: 'Go to Treasury',
          onPress: () =>
            navigation.navigate('AddTransaction', {groupId, groupName}),
        },
        {text: 'Done', style: 'cancel'},
      ],
    );
  };

  const renderSection = (section: 'before' | 'during' | 'after') => {
    const config = SECTION_CONFIG[section];
    const items = CHECKLIST_ITEMS.filter(item => item.section === section);
    const sectionCompleted = items.filter(item => checked[item.id]).length;

    return (
      <View key={section} style={styles.section}>
        <View style={styles.sectionHeader}>
          <View
            style={[
              styles.sectionIconContainer,
              {backgroundColor: `${config.color}20`},
            ]}>
            <Icon name={config.icon} size={20} color={config.color} />
          </View>
          <Text style={[styles.sectionTitle, {color: config.color}]}>
            {config.label}
          </Text>
          <Text style={styles.sectionProgress}>
            {sectionCompleted}/{items.length}
          </Text>
        </View>

        {items.map(item => {
          const isChecked = !!checked[item.id];
          const isSpecial = item.tappableAction === 'addTransaction';

          return (
            <View key={item.id}>
              <TouchableOpacity
                style={[
                  styles.checklistRow,
                  isChecked && styles.checklistRowChecked,
                ]}
                onPress={() => toggleItem(item.id)}
                testID={`checklist-item-${item.id}`}>
                <View
                  style={[
                    styles.checkbox,
                    isChecked && {
                      backgroundColor: config.color,
                      borderColor: config.color,
                    },
                  ]}>
                  {isChecked && (
                    <Icon name="check" size={14} color="#FFFFFF" />
                  )}
                </View>
                <Text
                  style={[
                    styles.checklistLabel,
                    isChecked && styles.checklistLabelChecked,
                  ]}>
                  {item.label}
                </Text>
                {isSpecial && (
                  <Icon name="cash" size={16} color="#4CAF50" style={{marginLeft: 4}} />
                )}
              </TouchableOpacity>

              {/* Special: 7th Tradition amount input */}
              {isSpecial && isChecked && (
                <View style={styles.traditionContainer}>
                  <Text style={styles.traditionLabel}>
                    Amount collected ($):
                  </Text>
                  <View style={styles.traditionInputRow}>
                    <TextInput
                      style={styles.traditionInput}
                      value={traditionAmount}
                      onChangeText={setTraditionAmount}
                      placeholder="0.00"
                      placeholderTextColor="#9E9E9E"
                      keyboardType="decimal-pad"
                      testID="tradition-amount-input"
                    />
                    <TouchableOpacity
                      style={styles.addToTreasuryButton}
                      onPress={handleAddToTreasury}
                      testID="add-to-treasury-button">
                      <Text style={styles.addToTreasuryButtonText}>
                        Add to Treasury
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.scrollView}
        keyboardShouldPersistTaps="handled"
        testID="meeting-checklist-screen">
        {/* Progress Header */}
        <View style={styles.progressHeader}>
          <View style={styles.progressInfo}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressCount}>
              {completedItems} / {totalItems} items
            </Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View
              style={[styles.progressBar, {width: `${progressPct}%`}]}
            />
          </View>
          <Text style={styles.progressPct}>{Math.round(progressPct)}%</Text>
        </View>

        {/* Checklist Sections */}
        {(['before', 'during', 'after'] as const).map(renderSection)}

        {/* End Meeting Button */}
        <View style={styles.endMeetingContainer}>
          <TouchableOpacity
            style={[
              styles.endMeetingButton,
              meetingEnded && styles.endMeetingButtonDone,
            ]}
            onPress={handleEndMeeting}
            disabled={meetingEnded}
            testID="end-meeting-button">
            <Icon
              name={meetingEnded ? 'check-circle' : 'flag-checkered'}
              size={20}
              color="#FFFFFF"
              style={{marginRight: 8}}
            />
            <Text style={styles.endMeetingButtonText}>
              {meetingEnded ? 'Meeting Ended' : 'End Meeting'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{height: 32}} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  progressHeader: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
  },
  progressCount: {
    fontSize: 14,
    color: '#757575',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#7B1FA2',
    borderRadius: 4,
  },
  progressPct: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'right',
  },
  section: {
    backgroundColor: '#FFFFFF',
    margin: 12,
    marginBottom: 4,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  sectionProgress: {
    fontSize: 13,
    color: '#9E9E9E',
    fontWeight: '500',
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  checklistRowChecked: {
    opacity: 0.7,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#9E9E9E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  checklistLabel: {
    flex: 1,
    fontSize: 14,
    color: '#212121',
    lineHeight: 20,
  },
  checklistLabelChecked: {
    textDecorationLine: 'line-through',
    color: '#9E9E9E',
  },
  traditionContainer: {
    backgroundColor: '#F1F8E9',
    borderRadius: 6,
    padding: 12,
    marginTop: 4,
    marginBottom: 8,
    marginLeft: 34,
  },
  traditionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#388E3C',
    marginBottom: 8,
  },
  traditionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  traditionInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#A5D6A7',
    borderRadius: 6,
    padding: 8,
    fontSize: 15,
    color: '#212121',
    backgroundColor: '#FFFFFF',
  },
  addToTreasuryButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  addToTreasuryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  endMeetingContainer: {
    margin: 16,
    marginTop: 12,
  },
  endMeetingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7B1FA2',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  endMeetingButtonDone: {
    backgroundColor: '#4CAF50',
  },
  endMeetingButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});

export default MeetingChecklistScreen;
