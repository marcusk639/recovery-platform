// mobile/src/screens/profile/SobrietyCalculatorScreen.tsx
import React, {useState, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RouteProp, useRoute} from '@react-navigation/native';
import {ProfileStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {selectUserData, updateSobrietyDate} from '../../store/slices/authSlice';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  calculateSobrietyStats,
  formatChipLabel,
  SobrietyStats,
} from '../../utils/sobrietyCalculator';

type SobrietyCalculatorRouteProp = RouteProp<
  ProfileStackParamList,
  'SobrietyCalculator'
>;

const SobrietyCalculatorScreen: React.FC = () => {
  const route = useRoute<SobrietyCalculatorRouteProp>();
  const dispatch = useAppDispatch();
  const userData = useAppSelector(selectUserData);

  // Determine initial date
  const getInitialDate = (): Date | null => {
    if (route.params?.initialDate) {
      return new Date(route.params.initialDate + 'T12:00:00');
    }
    if (userData?.sobrietyStartDate) {
      const d = userData.sobrietyStartDate;
      if (typeof d === 'string') return new Date(d);
      if (d && typeof (d as any).toDate === 'function') {
        return (d as any).toDate();
      }
    }
    return null;
  };

  const [selectedDate, setSelectedDate] = useState<Date | null>(getInitialDate);
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [chipsExpanded, setChipsExpanded] = useState(false);
  const [savingDate, setSavingDate] = useState(false);

  const stats: SobrietyStats | null = useMemo(() => {
    if (!selectedDate) return null;
    return calculateSobrietyStats(selectedDate);
  }, [selectedDate]);

  const formatDisplayDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleShare = useCallback(async () => {
    if (!stats || !selectedDate) return;

    const nextChipLabel = formatChipLabel(stats.nextChipDays);
    const nextChipDateStr = formatDisplayDate(stats.nextChipDate);

    const message =
      `I have ${stats.totalDays} days of recovery today!\n` +
      `Next milestone: ${nextChipLabel} on ${nextChipDateStr}.\n` +
      `Tracking my journey with Homegroups.`;

    try {
      await Share.share({message});
    } catch (err: any) {
      // User cancelled or error
    }
  }, [stats, selectedDate]);

  const handleSetAsMyDate = async () => {
    if (!selectedDate) return;
    setSavingDate(true);
    try {
      await dispatch(updateSobrietyDate({date: selectedDate})).unwrap();
      Alert.alert('Saved', 'Your sobriety date has been updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update sobriety date.');
    } finally {
      setSavingDate(false);
    }
  };

  const userSobrietyDate: Date | null = useMemo(() => {
    if (!userData?.sobrietyStartDate) return null;
    const d = userData.sobrietyStartDate;
    if (typeof d === 'string') return new Date(d);
    if (d && typeof (d as any).toDate === 'function') {
      return (d as any).toDate();
    }
    return null;
  }, [userData?.sobrietyStartDate]);

  const showSetAsMyDate = useMemo(() => {
    if (!selectedDate || !userData) return false;
    if (!userSobrietyDate) return true;
    return selectedDate.toDateString() !== userSobrietyDate.toDateString();
  }, [selectedDate, userData, userSobrietyDate]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Date Input Card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Sobriety Date</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setDatePickerVisible(true)}>
            <Icon name="calendar-outline" size={20} color="#7B1FA2" />
            <Text style={styles.dateButtonText}>
              {selectedDate ? formatDisplayDate(selectedDate) : 'Select a date'}
            </Text>
            <Icon name="chevron-down" size={16} color="#9E9E9E" />
          </TouchableOpacity>
          <Text style={styles.helperText}>
            Enter your sobriety date to see your stats
          </Text>
        </View>

        {stats !== null ? (
          <>
            {/* Stats Card */}
            <View style={styles.card}>
              <View style={styles.bigNumber}>
                <Text style={styles.daysCount}>{stats.totalDays}</Text>
                <Text style={styles.daysSober}>Days Sober</Text>
              </View>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownValue}>{stats.years}</Text>
                  <Text style={styles.breakdownLabel}>
                    {stats.years === 1 ? 'Year' : 'Years'}
                  </Text>
                </View>
                <View style={styles.breakdownDivider} />
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownValue}>{stats.months}</Text>
                  <Text style={styles.breakdownLabel}>
                    {stats.months === 1 ? 'Month' : 'Months'}
                  </Text>
                </View>
                <View style={styles.breakdownDivider} />
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownValue}>{stats.days}</Text>
                  <Text style={styles.breakdownLabel}>
                    {stats.days === 1 ? 'Day' : 'Days'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Next Chip Card */}
            <View style={styles.card}>
              <View style={styles.chipHeader}>
                <Icon name="medal-outline" size={22} color="#F9A825" />
                <Text style={styles.chipHeaderText}>Next Milestone</Text>
              </View>
              <Text style={styles.chipName}>
                {formatChipLabel(stats.nextChipDays)}
              </Text>
              <Text style={styles.chipDate}>
                {formatDisplayDate(stats.nextChipDate)}
              </Text>
              <Text style={styles.chipCountdown}>
                in {stats.daysUntilNextChip}{' '}
                {stats.daysUntilNextChip === 1 ? 'day' : 'days'}
              </Text>
            </View>

            {/* Past Chips Card */}
            {stats.pastChips.length > 0 && (
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.collapsibleHeader}
                  onPress={() => setChipsExpanded(!chipsExpanded)}>
                  <Text style={styles.collapsibleTitle}>
                    Chips Earned ({stats.pastChips.length})
                  </Text>
                  <Icon
                    name={chipsExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color="#9E9E9E"
                  />
                </TouchableOpacity>
                {chipsExpanded &&
                  stats.pastChips.map((chip, i) => (
                    <View key={i} style={styles.chipRow}>
                      <Icon name="medal" size={16} color="#F9A825" />
                      <Text style={styles.chipRowLabel}>{chip.label}</Text>
                      <Text style={styles.chipRowDate}>
                        {formatDisplayDate(chip.earnedDate)}
                      </Text>
                    </View>
                  ))}
              </View>
            )}

            {/* Share Card */}
            <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
              <Icon name="share-outline" size={20} color="#fff" />
              <Text style={styles.shareButtonText}>Share My Progress</Text>
            </TouchableOpacity>

            {/* Set as my sobriety date */}
            {showSetAsMyDate && (
              <TouchableOpacity
                style={[styles.setDateButton, savingDate && {opacity: 0.6}]}
                onPress={handleSetAsMyDate}
                disabled={savingDate}>
                <Icon name="save-outline" size={18} color="#7B1FA2" />
                <Text style={styles.setDateButtonText}>
                  {savingDate ? 'Saving...' : 'Set as My Sobriety Date'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Icon name="calculator-outline" size={56} color="#CE93D8" />
            <Text style={styles.emptyTitle}>Enter a Sobriety Date</Text>
            <Text style={styles.emptyBody}>
              Pick a date above to see your sobriety stats, milestones, and
              upcoming chips.
            </Text>
          </View>
        )}
      </ScrollView>

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        maximumDate={new Date()}
        date={selectedDate || new Date()}
        onConfirm={date => {
          setSelectedDate(date);
          setDatePickerVisible(false);
        }}
        onCancel={() => setDatePickerVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F3E5F5'},
  scrollContent: {padding: 16, paddingBottom: 40},
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CE93D8',
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  dateButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#212121',
  },
  helperText: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 6,
  },
  bigNumber: {alignItems: 'center', paddingVertical: 12},
  daysCount: {
    fontSize: 72,
    fontWeight: '800',
    color: '#7B1FA2',
    lineHeight: 80,
  },
  daysSober: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9E9E9E',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  breakdownItem: {alignItems: 'center'},
  breakdownValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#4A148C',
  },
  breakdownLabel: {fontSize: 13, color: '#9E9E9E'},
  breakdownDivider: {width: 1, backgroundColor: '#F0F0F0'},
  chipHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 10},
  chipHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginLeft: 6,
  },
  chipName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 4,
  },
  chipDate: {fontSize: 15, color: '#616161', marginBottom: 4},
  chipCountdown: {
    fontSize: 15,
    color: '#F9A825',
    fontWeight: '600',
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  collapsibleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  chipRowLabel: {
    flex: 1,
    fontSize: 14,
    color: '#424242',
    marginLeft: 8,
  },
  chipRowDate: {fontSize: 13, color: '#9E9E9E'},
  shareButton: {
    backgroundColor: '#7B1FA2',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 6,
  },
  setDateButton: {
    borderWidth: 1.5,
    borderColor: '#CE93D8',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  setDateButtonText: {
    color: '#7B1FA2',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4A148C',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default SobrietyCalculatorScreen;
