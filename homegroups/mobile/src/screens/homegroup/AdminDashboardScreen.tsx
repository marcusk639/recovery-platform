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
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchDashboardMetrics,
  fetchEngagementMetrics,
  selectDashboardMetrics,
  selectDashboardLoading,
  selectDashboardError,
  selectEngagementMetrics,
  selectEngagementLoading,
  clearDashboard,
} from '../../store/slices/dashboardSlice';

const ProgressBar: React.FC<{
  percentage: number;
  label: string;
  fraction: string;
}> = ({percentage, label, fraction}) => (
  <View style={engagementStyles.progressRow}>
    <Text style={engagementStyles.progressLabel}>{label}</Text>
    <View style={engagementStyles.progressTrack}>
      <View
        style={[
          engagementStyles.progressFill,
          {width: `${Math.min(percentage, 100)}%`},
        ]}
      />
    </View>
    <Text style={engagementStyles.progressFraction}>{fraction}</Text>
  </View>
);

type AdminDashboardRouteProp = RouteProp<GroupStackParamList, 'AdminDashboard'>;

type AdminDashboardNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'AdminDashboard'
>;

type Period = 'week' | 'month' | 'all_time';

const PERIOD_LABELS: Record<Period, string> = {
  week: 'This Week',
  month: 'This Month',
  all_time: 'All Time',
};

const AdminDashboardScreen: React.FC = () => {
  const route = useRoute<AdminDashboardRouteProp>();
  const {groupId, groupName} = route.params;
  const navigation = useNavigation<AdminDashboardNavigationProp>();
  const dispatch = useAppDispatch();

  const metrics = useAppSelector(selectDashboardMetrics);
  const loading = useAppSelector(selectDashboardLoading);
  const error = useAppSelector(selectDashboardError);
  const engagementMetrics = useAppSelector(selectEngagementMetrics);
  const engagementLoading = useAppSelector(selectEngagementLoading);

  const [period, setPeriod] = useState<Period>('month');
  const [refreshing, setRefreshing] = useState(false);

  const loadMetrics = useCallback(
    async (selectedPeriod: Period, isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      }
      try {
        await dispatch(
          fetchDashboardMetrics({groupId, period: selectedPeriod}),
        ).unwrap();
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Failed to load dashboard metrics.';
        Alert.alert('Error', message);
      } finally {
        if (isRefresh) {
          setRefreshing(false);
        }
      }
    },
    [groupId, dispatch],
  );

  const loadEngagementMetrics = useCallback(async () => {
    // Engagement metrics are non-critical — silently swallow errors
    try {
      await dispatch(fetchEngagementMetrics({groupId})).unwrap();
    } catch {
      // intentionally ignored
    }
  }, [groupId, dispatch]);

  useEffect(() => {
    dispatch(clearDashboard());
    loadMetrics(period);
    loadEngagementMetrics();
  }, [dispatch, loadMetrics, loadEngagementMetrics]);

  const handlePeriodChange = (newPeriod: Period) => {
    setPeriod(newPeriod);
    loadMetrics(newPeriod);
  };

  const handleRefresh = () => {
    loadMetrics(period, true);
  };

  const formatCurrency = (amount: number): string => {
    return `$${amount.toFixed(2)}`;
  };

  const formatPercent = (value: number): string => {
    return `${Math.round(value * 100)}%`;
  };

  if (loading && !metrics) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Period Selector */}
      <View style={styles.periodSelectorContainer}>
        {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
          <TouchableOpacity
            key={p}
            style={[
              styles.periodButton,
              period === p && styles.periodButtonActive,
            ]}
            onPress={() => handlePeriodChange(p)}
            testID={`dashboard-period-${p}`}>
            <Text
              style={[
                styles.periodButtonText,
                period === p && styles.periodButtonTextActive,
              ]}>
              {PERIOD_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Icon name="alert-circle-outline" size={40} color="#D32F2F" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadMetrics(period)}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          testID="admin-dashboard-scroll">
          {loading && (
            <View style={styles.inlineLoadingContainer}>
              <ActivityIndicator size="small" color="#1976D2" />
            </View>
          )}

          {/* 7th Tradition Donations Callout */}
          <TouchableOpacity
            style={styles.donationCallout}
            onPress={() =>
              navigation.navigate('GroupDonation', {groupId, groupName})
            }
            testID="donation-callout">
            <View style={styles.donationCalloutContent}>
              <Text style={styles.donationCalloutTitle}>
                Accept 7th Tradition Contributions
              </Text>
              <Text style={styles.donationCalloutBody}>
                Members can contribute to your group's 7th Tradition fund
                directly through the app. Set up takes under 2 minutes.
              </Text>
              <Text style={styles.donationCalloutCta}>Set Up Donations →</Text>
            </View>
          </TouchableOpacity>

          {metrics && (
            <>
              {/* Activity Metrics */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Icon name="chart-line" size={20} color="#1976D2" />
                  <Text style={styles.sectionTitle}>Activity</Text>
                </View>
                <View style={styles.metricsRow}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>
                      {metrics.messageCount}
                    </Text>
                    <Text style={styles.metricLabel}>Messages</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>
                      {metrics.announcementCount}
                    </Text>
                    <Text style={styles.metricLabel}>Announcements</Text>
                  </View>
                </View>
              </View>

              {/* Member Metrics */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Icon name="account-group" size={20} color="#388E3C" />
                  <Text style={styles.sectionTitle}>Members</Text>
                </View>
                <View style={styles.metricsRow}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>
                      {metrics.totalMembers}
                    </Text>
                    <Text style={styles.metricLabel}>Total</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>
                      {metrics.activeMembers}
                    </Text>
                    <Text style={styles.metricLabel}>Active</Text>
                  </View>
                </View>
                <View style={styles.metricsRow}>
                  <View style={[styles.metricCard, styles.metricCardGreen]}>
                    <Text style={[styles.metricValue, styles.metricValueGreen]}>
                      +{metrics.newMembers}
                    </Text>
                    <Text style={styles.metricLabel}>Joined</Text>
                  </View>
                  <View style={[styles.metricCard, styles.metricCardRed]}>
                    <Text style={[styles.metricValue, styles.metricValueRed]}>
                      -{metrics.membersLeft}
                    </Text>
                    <Text style={styles.metricLabel}>Left</Text>
                  </View>
                </View>
                {metrics.memberEngagementRate !== undefined && (
                  <View style={styles.singleMetricRow}>
                    <Text style={styles.metricLabel}>Engagement Rate</Text>
                    <Text style={styles.metricValueInline}>
                      {formatPercent(metrics.memberEngagementRate)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Treasury Metrics */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Icon name="currency-usd" size={20} color="#F57C00" />
                  <Text style={styles.sectionTitle}>Treasury</Text>
                </View>
                <View style={styles.treasuryBalanceContainer}>
                  <Text style={styles.treasuryBalanceLabel}>
                    Current Balance
                  </Text>
                  <Text style={styles.treasuryBalanceValue}>
                    {formatCurrency(metrics.treasuryBalance)}
                  </Text>
                </View>
                <View style={styles.metricsRow}>
                  <View style={[styles.metricCard, styles.metricCardGreen]}>
                    <Text style={[styles.metricValue, styles.metricValueGreen]}>
                      {formatCurrency(metrics.periodIncome)}
                    </Text>
                    <Text style={styles.metricLabel}>Income</Text>
                  </View>
                  <View style={[styles.metricCard, styles.metricCardRed]}>
                    <Text style={[styles.metricValue, styles.metricValueRed]}>
                      {formatCurrency(metrics.periodExpenses)}
                    </Text>
                    <Text style={styles.metricLabel}>Expenses</Text>
                  </View>
                </View>
                <View style={styles.singleMetricRow}>
                  <Text style={styles.metricLabel}>Transactions</Text>
                  <Text style={styles.metricValueInline}>
                    {metrics.transactionCount}
                  </Text>
                </View>
              </View>

              {/* Meeting Metrics */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Icon name="calendar-check" size={20} color="#7B1FA2" />
                  <Text style={styles.sectionTitle}>Meetings</Text>
                </View>
                <View style={styles.metricsRow}>
                  <View style={[styles.metricCard, styles.metricCardGreen]}>
                    <Text style={[styles.metricValue, styles.metricValueGreen]}>
                      {metrics.meetingsHeld}
                    </Text>
                    <Text style={styles.metricLabel}>Held</Text>
                  </View>
                  <View style={[styles.metricCard, styles.metricCardRed]}>
                    <Text style={[styles.metricValue, styles.metricValueRed]}>
                      {metrics.meetingsCancelled}
                    </Text>
                    <Text style={styles.metricLabel}>Cancelled</Text>
                  </View>
                </View>
                {metrics.averageAttendance !== undefined && (
                  <View style={styles.singleMetricRow}>
                    <Text style={styles.metricLabel}>Avg Attendance</Text>
                    <Text style={styles.metricValueInline}>
                      {metrics.averageAttendance}
                    </Text>
                  </View>
                )}
                <View style={styles.singleMetricRow}>
                  <Text style={styles.metricLabel}>Total Attendance</Text>
                  <Text style={styles.metricValueInline}>
                    {metrics.totalAttendance}
                  </Text>
                </View>
              </View>

              {/* Member Engagement Section */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Icon name="account-heart" size={20} color="#E91E63" />
                  <Text style={styles.sectionTitle}>Member Engagement</Text>
                </View>
                {engagementLoading ? (
                  <ActivityIndicator size="small" color="#E91E63" />
                ) : engagementMetrics ? (
                  <>
                    {engagementMetrics.windows.map(window => (
                      <ProgressBar
                        key={window.windowDays}
                        label={`Last ${window.windowDays} days`}
                        percentage={window.percentage}
                        fraction={`${window.activeCount} / ${window.totalMembers} members (${window.percentage}%)`}
                      />
                    ))}
                    <Text style={engagementStyles.engagementSubtext}>
                      Based on app activity. Tap 'Group Health' for trend
                      charts.
                    </Text>
                    {engagementMetrics.dataAvailabilityNote && (
                      <Text style={engagementStyles.availabilityNote}>
                        {engagementMetrics.dataAvailabilityNote}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.emptyText}>
                    Engagement data unavailable
                  </Text>
                )}
              </View>

              {/* Computed At Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  Last updated:{' '}
                  {metrics.computedAt instanceof Date &&
                  !isNaN(metrics.computedAt.getTime())
                    ? metrics.computedAt.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'}
                </Text>
              </View>
            </>
          )}

          {!metrics && !loading && (
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
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#757575',
  },
  inlineLoadingContainer: {
    paddingVertical: 8,
    alignItems: 'center',
  },
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
  retryButton: {
    backgroundColor: '#1976D2',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  periodSelectorContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
    marginHorizontal: 4,
  },
  periodButtonActive: {
    backgroundColor: '#1976D2',
  },
  periodButtonText: {
    fontSize: 13,
    color: '#757575',
    fontWeight: '500',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
  },
  section: {
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginLeft: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  metricCardGreen: {
    backgroundColor: '#E8F5E9',
  },
  metricCardRed: {
    backgroundColor: '#FFEBEE',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 4,
  },
  metricValueGreen: {
    color: '#2E7D32',
  },
  metricValueRed: {
    color: '#C62828',
  },
  metricLabel: {
    fontSize: 12,
    color: '#757575',
    textAlign: 'center',
  },
  singleMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginTop: 4,
  },
  metricValueInline: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  treasuryBalanceContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
  },
  treasuryBalanceLabel: {
    fontSize: 12,
    color: '#F57C00',
    fontWeight: '500',
    marginBottom: 4,
  },
  treasuryBalanceValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#E65100',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 4,
  },
  footerText: {
    fontSize: 12,
    color: '#BDBDBD',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 14,
    color: '#BDBDBD',
    marginTop: 12,
  },
  donationCallout: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#388E3C',
    padding: 14,
  },
  donationCalloutContent: {
    gap: 4,
  },
  donationCalloutTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1B5E20',
  },
  donationCalloutBody: {
    fontSize: 12,
    color: '#2E7D32',
    lineHeight: 17,
  },
  donationCalloutCta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#388E3C',
    marginTop: 4,
  },
});

const engagementStyles = StyleSheet.create({
  progressRow: {
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 12,
    color: '#424242',
    marginBottom: 4,
    fontWeight: '500',
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#E91E63',
    borderRadius: 4,
  },
  progressFraction: {
    fontSize: 11,
    color: '#757575',
  },
  engagementSubtext: {
    fontSize: 11,
    color: '#9E9E9E',
    marginTop: 8,
  },
  availabilityNote: {
    fontSize: 11,
    color: '#9E9E9E',
    fontStyle: 'italic',
    marginTop: 4,
  },
});

export default AdminDashboardScreen;
