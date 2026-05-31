import React, {useState, useCallback, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  VictoryChart,
  VictoryLine,
  VictoryBar,
  VictoryPie,
  VictoryAxis,
  VictoryArea,
  VictoryTheme,
  VictoryGroup,
  VictoryLegend,
} from 'victory-native';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchGroupHealth,
  selectGroupHealthData,
  selectGroupHealthLoading,
  selectGroupHealthError,
  clearGroupHealth,
} from '../../store/slices/groupHealthSlice';

type GroupHealthDashboardRouteProp = RouteProp<
  GroupStackParamList,
  'GroupHealthDashboard'
>;
type GroupHealthDashboardNavProp = StackNavigationProp<GroupStackParamList>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 48;

type MonthsOption = 3 | 6 | 12;

const GroupHealthDashboardScreen: React.FC = () => {
  const route = useRoute<GroupHealthDashboardRouteProp>();
  const navigation = useNavigation<GroupHealthDashboardNavProp>();
  const {groupId, groupName} = route.params;
  const dispatch = useAppDispatch();

  const data = useAppSelector(selectGroupHealthData);
  const loading = useAppSelector(selectGroupHealthLoading);
  const error = useAppSelector(selectGroupHealthError);

  const [months, setMonths] = useState<MonthsOption>(6);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (selectedMonths: MonthsOption, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        await dispatch(
          fetchGroupHealth({groupId, months: selectedMonths}),
        ).unwrap();
      } catch (err: any) {
        Alert.alert('Error', err || 'Failed to load group health data.');
      } finally {
        if (isRefresh) setRefreshing(false);
      }
    },
    [groupId, dispatch],
  );

  useEffect(() => {
    dispatch(clearGroupHealth());
    load(months);
  }, []);

  const handleMonthsChange = (m: MonthsOption) => {
    setMonths(m);
    load(m);
  };

  const formatMonth = (label: string): string => {
    const [year, month] = label.split('-');
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return d.toLocaleString('en-US', {month: 'short'});
  };

  const hasAttendanceData = data?.attendanceTrend.some(p => p.value > 0);

  if (loading && !data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6A1B9A" />
        <Text style={styles.loadingText}>Loading group health...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Period Picker */}
      <View style={styles.periodRow}>
        {([3, 6, 12] as MonthsOption[]).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.periodBtn, months === m && styles.periodBtnActive]}
            onPress={() => handleMonthsChange(m)}
            testID={`health-period-${m}`}>
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

      {error ? (
        <View style={styles.errorContainer}>
          <Icon name="alert-circle-outline" size={40} color="#D32F2F" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load(months)}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(months, true)}
            />
          }
          testID="group-health-scroll">
          {loading && (
            <View style={styles.inlineLoading}>
              <ActivityIndicator size="small" color="#6A1B9A" />
            </View>
          )}

          {data && (
            <>
              {/* RETENTION */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name="account-group" size={20} color="#6A1B9A" />
                  <Text style={styles.cardTitle}>Member Retention</Text>
                </View>
                <View style={styles.retentionNumbers}>
                  <View style={styles.retentionStat}>
                    <Text style={[styles.retentionValue, {color: '#4CAF50'}]}>
                      {data.retention.activeCount}
                    </Text>
                    <Text style={styles.retentionLabel}>Active</Text>
                  </View>
                  <View style={styles.retentionStat}>
                    <Text style={[styles.retentionValue, {color: '#9E9E9E'}]}>
                      {data.retention.inactiveCount}
                    </Text>
                    <Text style={styles.retentionLabel}>Inactive</Text>
                  </View>
                </View>
                {data.retention.totalMembers > 0 && (
                  <View style={styles.chartContainer}>
                    <VictoryPie
                      width={200}
                      height={200}
                      data={[
                        {x: 'Active', y: data.retention.activeCount || 1},
                        {x: 'Inactive', y: data.retention.inactiveCount || 0},
                      ]}
                      colorScale={['#4CAF50', '#E0E0E0']}
                      innerRadius={60}
                      labels={({datum}) =>
                        datum.y > 0 ? `${datum.x}: ${datum.y}` : ''
                      }
                      style={{labels: {fontSize: 11, fill: '#424242'}}}
                    />
                  </View>
                )}
                <Text style={styles.subtext}>
                  Active = app activity in last 90 days
                </Text>
              </View>

              {/* ATTENDANCE TREND */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name="chart-line" size={20} color="#1976D2" />
                  <Text style={styles.cardTitle}>Avg. Attendance per Meeting</Text>
                </View>
                {hasAttendanceData ? (
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
                      data={data.attendanceTrend.map(p => ({
                        x: p.month,
                        y: p.value,
                      }))}
                      style={{data: {stroke: '#1976D2', strokeWidth: 2}}}
                      animate={{duration: 400}}
                    />
                  </VictoryChart>
                ) : (
                  <View style={styles.emptyChart}>
                    <Icon
                      name="chart-line-variant"
                      size={40}
                      color="#BDBDBD"
                    />
                    <Text style={styles.emptyChartText}>
                      No check-in data yet. Enable QR check-in at your next
                      meeting to start tracking attendance.
                    </Text>
                  </View>
                )}
                <Text style={styles.subtext}>
                  Based on QR check-in data
                </Text>
                <TouchableOpacity
                  style={styles.seeMoreLink}
                  onPress={() =>
                    navigation.navigate('AttendanceAnalytics', {
                      groupId,
                      groupName,
                    })
                  }
                  testID="see-attendance-analytics-link">
                  <Text style={styles.seeMoreText}>
                    See Full Attendance Report →
                  </Text>
                </TouchableOpacity>
              </View>

              {/* TREASURY TREND */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name="currency-usd" size={20} color="#F57C00" />
                  <Text style={styles.cardTitle}>Monthly Income vs. Expenses</Text>
                </View>
                {data.treasuryTrend.length > 0 ? (
                  <>
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
                        tickFormat={v => `$${v}`}
                        style={{
                          tickLabels: {fontSize: 10, fill: '#757575'},
                          grid: {stroke: '#F0F0F0'},
                        }}
                      />
                      <VictoryGroup offset={12}>
                        <VictoryBar
                          data={data.treasuryTrend.map(p => ({
                            x: p.month,
                            y: p.income,
                          }))}
                          style={{data: {fill: '#4CAF50', width: 10}}}
                          animate={{duration: 400}}
                        />
                        <VictoryBar
                          data={data.treasuryTrend.map(p => ({
                            x: p.month,
                            y: p.expenses,
                          }))}
                          style={{data: {fill: '#F44336', width: 10}}}
                          animate={{duration: 400}}
                        />
                      </VictoryGroup>
                    </VictoryChart>
                    <View style={styles.legendRow}>
                      <View style={styles.legendItem}>
                        <View
                          style={[
                            styles.legendDot,
                            {backgroundColor: '#4CAF50'},
                          ]}
                        />
                        <Text style={styles.legendText}>Income</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View
                          style={[
                            styles.legendDot,
                            {backgroundColor: '#F44336'},
                          ]}
                        />
                        <Text style={styles.legendText}>Expenses</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.emptyChart}>
                    <Icon name="cash-multiple" size={40} color="#BDBDBD" />
                    <Text style={styles.emptyChartText}>
                      No transaction data for this period.
                    </Text>
                  </View>
                )}
              </View>

              {/* ENGAGEMENT TREND */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name="account-heart" size={20} color="#E91E63" />
                  <Text style={styles.cardTitle}>Member Engagement</Text>
                </View>
                {data.engagementTrend.some(p => p.value > 0) ? (
                  <VictoryChart
                    width={CHART_WIDTH}
                    height={200}
                    theme={VictoryTheme.material}
                    domain={{y: [0, 100]}}
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
                      tickFormat={v => `${v}%`}
                      style={{
                        tickLabels: {fontSize: 10, fill: '#757575'},
                        grid: {stroke: '#F0F0F0'},
                      }}
                    />
                    <VictoryArea
                      data={data.engagementTrend.map(p => ({
                        x: p.month,
                        y: p.value,
                      }))}
                      style={{
                        data: {
                          fill: '#FCE4EC',
                          stroke: '#E91E63',
                          strokeWidth: 2,
                        },
                      }}
                      animate={{duration: 400}}
                    />
                  </VictoryChart>
                ) : (
                  <View style={styles.emptyChart}>
                    <Icon name="message-outline" size={40} color="#BDBDBD" />
                    <Text style={styles.emptyChartText}>
                      No chat activity data yet.
                    </Text>
                  </View>
                )}
                <Text style={styles.subtext}>
                  % of members who sent a message in the group chat
                </Text>
              </View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  Updated{' '}
                  {new Date(data.computedAt).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                <TouchableOpacity
                  onPress={() => load(months, true)}
                  testID="health-refresh-btn">
                  <Text style={styles.refreshText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {!data && !loading && (
            <View style={styles.emptyContainer}>
              <Icon name="chart-box-outline" size={48} color="#BDBDBD" />
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
    backgroundColor: '#F5F5F5',
  },
  loadingText: {marginTop: 12, fontSize: 14, color: '#757575'},
  inlineLoading: {paddingVertical: 8, alignItems: 'center'},
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 14,
    color: '#D32F2F',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#6A1B9A',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 6,
  },
  retryBtnText: {color: '#FFFFFF', fontWeight: '600', fontSize: 14},
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
  periodBtnActive: {backgroundColor: '#6A1B9A'},
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
  },
  retentionNumbers: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  retentionStat: {alignItems: 'center'},
  retentionValue: {fontSize: 32, fontWeight: '700'},
  retentionLabel: {fontSize: 12, color: '#757575', marginTop: 2},
  chartContainer: {alignItems: 'center'},
  subtext: {fontSize: 11, color: '#9E9E9E', marginTop: 8},
  seeMoreLink: {marginTop: 12},
  seeMoreText: {color: '#1976D2', fontSize: 13, fontWeight: '500'},
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
    gap: 24,
  },
  legendItem: {flexDirection: 'row', alignItems: 'center'},
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {fontSize: 12, color: '#424242'},
  emptyChart: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyChartText: {
    fontSize: 13,
    color: '#9E9E9E',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 4,
    gap: 16,
  },
  footerText: {fontSize: 12, color: '#BDBDBD'},
  refreshText: {fontSize: 12, color: '#6A1B9A', fontWeight: '500'},
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {fontSize: 14, color: '#BDBDBD', marginTop: 12},
});

export default GroupHealthDashboardScreen;
