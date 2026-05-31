import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import {RouteProp, useRoute} from '@react-navigation/native';
import functions from '@react-native-firebase/functions';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  VictoryChart,
  VictoryLine,
  VictoryBar,
  VictoryAxis,
  VictoryTheme,
} from 'victory-native';
import {GroupStackParamList} from '../../types/navigation';

type AttendanceAnalyticsRouteProp = RouteProp<
  GroupStackParamList,
  'AttendanceAnalytics'
>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 48;

type MonthsOption = 3 | 6 | 12;

interface MeetingAttendanceSummary {
  meetingId: string;
  meetingName: string;
  dayOfWeek: string;
  avgAttendance: number;
  maxAttendance: number;
  minAttendance: number;
  instanceCount: number;
  trend: {month: string; value: number}[];
}

interface AttendanceByDayOfWeek {
  day: string;
  avgCount: number;
  instanceCount: number;
}

interface AttendanceAnalyticsResult {
  groupId: string;
  months: number;
  meetings: MeetingAttendanceSummary[];
  byDayOfWeek: AttendanceByDayOfWeek[];
  overallAvg: number;
  bestAttendedMeetingId?: string;
  computedAt: string;
}

const AttendanceAnalyticsScreen: React.FC = () => {
  const route = useRoute<AttendanceAnalyticsRouteProp>();
  const {groupId, groupName} = route.params;

  const [months, setMonths] = useState<MonthsOption>(6);
  const [data, setData] = useState<AttendanceAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(
    null,
  );

  const loadData = async (selectedMonths: MonthsOption) => {
    setLoading(true);
    try {
      const callable = functions().httpsCallable('getAttendanceAnalytics');
      const result = await callable({groupId, months: selectedMonths});
      setData(result.data as AttendanceAnalyticsResult);
    } catch (err: any) {
      Alert.alert(
        'Error',
        err.message || 'Failed to load attendance analytics.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(months);
  }, []);

  const handleMonthsChange = (m: MonthsOption) => {
    setMonths(m);
    setSelectedMeetingId(null);
    loadData(m);
  };

  const selectedMeeting = data?.meetings.find(
    m => m.meetingId === selectedMeetingId,
  );

  const formatMonth = (label: string): string => {
    const [year, month] = label.split('-');
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return d.toLocaleString('en-US', {month: 'short'});
  };

  return (
    <View style={styles.container}>
      {/* Period Picker */}
      <View style={styles.periodRow}>
        {([3, 6, 12] as MonthsOption[]).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.periodBtn, months === m && styles.periodBtnActive]}
            onPress={() => handleMonthsChange(m)}
            testID={`attendance-period-${m}`}>
            <Text
              style={[
                styles.periodBtnText,
                months === m && styles.periodBtnTextActive,
              ]}>
              {m}M
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
          <Text style={styles.loadingText}>Loading attendance data...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          testID="attendance-analytics-scroll">
          {data && (
            <>
              {/* OVERVIEW */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name="chart-bar" size={20} color="#1976D2" />
                  <Text style={styles.cardTitle}>Overall Attendance</Text>
                </View>
                <View style={styles.statRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {data.overallAvg.toFixed(1)}
                    </Text>
                    <Text style={styles.statLabel}>Avg per meeting</Text>
                  </View>
                  {data.bestAttendedMeetingId && (
                    <View style={styles.statItem}>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {data.meetings.find(
                          m => m.meetingId === data.bestAttendedMeetingId,
                        )?.meetingName || 'N/A'}
                      </Text>
                      <Text style={styles.statLabel}>Best attended</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* BY MEETING */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name="calendar-multiple" size={20} color="#1976D2" />
                  <Text style={styles.cardTitle}>Meetings Breakdown</Text>
                </View>
                {data.meetings.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Icon
                      name="calendar-blank"
                      size={40}
                      color="#BDBDBD"
                    />
                    <Text style={styles.emptyText}>
                      No meeting data for this period.
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    horizontal
                    data={data.meetings}
                    keyExtractor={item => item.meetingId}
                    showsHorizontalScrollIndicator={false}
                    renderItem={({item}) => (
                      <TouchableOpacity
                        style={[
                          styles.meetingCard,
                          selectedMeetingId === item.meetingId &&
                            styles.meetingCardSelected,
                        ]}
                        onPress={() =>
                          setSelectedMeetingId(
                            selectedMeetingId === item.meetingId
                              ? null
                              : item.meetingId,
                          )
                        }
                        testID={`meeting-card-${item.meetingId}`}>
                        <Text
                          style={styles.meetingCardName}
                          numberOfLines={2}>
                          {item.meetingName}
                        </Text>
                        <Text style={styles.meetingCardAvg}>
                          Avg: {item.avgAttendance}
                        </Text>
                        <Text style={styles.meetingCardDay}>
                          {item.dayOfWeek}
                        </Text>
                      </TouchableOpacity>
                    )}
                    contentContainerStyle={styles.meetingListContent}
                  />
                )}
              </View>

              {/* PER-MEETING TREND (when meeting selected) */}
              {selectedMeeting && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Icon name="trending-up" size={20} color="#1976D2" />
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {selectedMeeting.meetingName} Trend
                    </Text>
                  </View>
                  {selectedMeeting.trend.length > 0 ? (
                    <VictoryChart
                      width={CHART_WIDTH}
                      height={200}
                      theme={VictoryTheme.material}
                      domainPadding={{x: 20}}>
                      <VictoryAxis
                        tickFormat={label => formatMonth(label)}
                        style={{
                          tickLabels: {fontSize: 10, fill: '#757575'},
                          grid: {stroke: 'none'},
                        }}
                      />
                      <VictoryAxis
                        dependentAxis
                        style={{
                          tickLabels: {fontSize: 10, fill: '#757575'},
                          grid: {stroke: '#F0F0F0'},
                        }}
                      />
                      <VictoryLine
                        data={selectedMeeting.trend.map(p => ({
                          x: p.month,
                          y: p.value,
                        }))}
                        style={{
                          data: {stroke: '#1976D2', strokeWidth: 2},
                        }}
                        animate={{duration: 400}}
                      />
                    </VictoryChart>
                  ) : (
                    <Text style={styles.emptyText}>
                      Not enough data for trend.
                    </Text>
                  )}
                  <View style={styles.meetingStatsRow}>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatValue}>
                        {selectedMeeting.maxAttendance}
                      </Text>
                      <Text style={styles.miniStatLabel}>Max</Text>
                    </View>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatValue}>
                        {selectedMeeting.minAttendance}
                      </Text>
                      <Text style={styles.miniStatLabel}>Min</Text>
                    </View>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatValue}>
                        {selectedMeeting.instanceCount}
                      </Text>
                      <Text style={styles.miniStatLabel}>Held</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* BY DAY OF WEEK */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name="calendar-week" size={20} color="#1976D2" />
                  <Text style={styles.cardTitle}>
                    Attendance by Day of Week
                  </Text>
                </View>
                {data.byDayOfWeek.some(d => d.avgCount > 0) ? (
                  <>
                    <VictoryChart
                      width={CHART_WIDTH}
                      height={200}
                      theme={VictoryTheme.material}
                      domainPadding={{x: 20}}>
                      <VictoryAxis
                        style={{
                          tickLabels: {fontSize: 10, fill: '#757575'},
                          grid: {stroke: 'none'},
                        }}
                      />
                      <VictoryAxis
                        dependentAxis
                        style={{
                          tickLabels: {fontSize: 10, fill: '#757575'},
                          grid: {stroke: '#F0F0F0'},
                        }}
                      />
                      <VictoryBar
                        data={data.byDayOfWeek.map(d => ({
                          x: d.day,
                          y: d.avgCount,
                        }))}
                        style={{data: {fill: '#1976D2'}}}
                        animate={{duration: 400}}
                      />
                    </VictoryChart>
                    <Text style={styles.subtext}>All meetings combined</Text>
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <Icon name="calendar-blank" size={40} color="#BDBDBD" />
                    <Text style={styles.emptyText}>
                      No attendance data for this period.
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  Updated{' '}
                  {new Date(data.computedAt).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </>
          )}

          {!data && !loading && (
            <View style={styles.loadingContainer}>
              <Icon name="chart-bar-stacked" size={48} color="#BDBDBD" />
              <Text style={styles.emptyText}>No data available</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {marginTop: 12, fontSize: 14, color: '#757575'},
  periodRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
    marginHorizontal: 4,
  },
  periodBtnActive: {backgroundColor: '#1976D2'},
  periodBtnText: {fontSize: 13, color: '#757575', fontWeight: '500'},
  periodBtnTextActive: {color: '#FFFFFF', fontWeight: '600'},
  scroll: {flex: 1},
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    margin: 12,
    marginBottom: 0,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginLeft: 8,
    flex: 1,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {alignItems: 'center', flex: 1},
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    textAlign: 'center',
  },
  statLabel: {fontSize: 12, color: '#757575', marginTop: 2, textAlign: 'center'},
  meetingListContent: {paddingVertical: 4},
  meetingCard: {
    width: 140,
    height: 100,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  meetingCardSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#E3F2FD',
  },
  meetingCardName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#212121',
  },
  meetingCardAvg: {fontSize: 12, color: '#1976D2', fontWeight: '500'},
  meetingCardDay: {fontSize: 11, color: '#9E9E9E'},
  meetingStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  miniStat: {alignItems: 'center'},
  miniStatValue: {fontSize: 18, fontWeight: '700', color: '#212121'},
  miniStatLabel: {fontSize: 11, color: '#757575', marginTop: 2},
  subtext: {fontSize: 11, color: '#9E9E9E', marginTop: 8},
  emptyState: {alignItems: 'center', paddingVertical: 24},
  emptyText: {
    fontSize: 13,
    color: '#9E9E9E',
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 4,
  },
  footerText: {fontSize: 12, color: '#BDBDBD'},
});

export default AttendanceAnalyticsScreen;
