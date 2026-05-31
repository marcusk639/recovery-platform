import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {formatDistanceToNow} from 'date-fns';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchGroupReports,
  selectReportsByGroup,
  selectReportsStatus,
  selectReportsError,
} from '../../store/slices/reportsSlice';
import {Report} from '../../models/ReportModel';
import {ReportStatus} from '../../types/schema';

type ModerationQueueScreenRouteProp = RouteProp<
  GroupStackParamList,
  'ModerationQueue'
>;
type ModerationQueueScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'ModerationQueue'
>;

const STATUS_FILTERS: {label: string; value: ReportStatus | 'all'}[] = [
  {label: 'All', value: 'all'},
  {label: 'Pending', value: 'pending'},
  {label: 'Reviewed', value: 'reviewed'},
  {label: 'Actioned', value: 'actioned'},
  {label: 'Dismissed', value: 'dismissed'},
];

const getReasonLabel = (reason: string): string => {
  const labels: Record<string, string> = {
    harassment: 'Harassment',
    spam: 'Spam',
    inappropriate: 'Inappropriate',
    threatening: 'Threatening',
    other: 'Other',
  };
  return labels[reason] || reason;
};

const getContentTypeIcon = (contentType: string): string => {
  switch (contentType) {
    case 'message':
      return 'message-text';
    case 'announcement':
      return 'bullhorn';
    case 'user':
      return 'account';
    default:
      return 'file-document';
  }
};

const getStatusColor = (status: ReportStatus): string => {
  switch (status) {
    case 'pending':
      return '#FF9800';
    case 'reviewed':
      return '#2196F3';
    case 'actioned':
      return '#4CAF50';
    case 'dismissed':
      return '#9E9E9E';
    default:
      return '#757575';
  }
};

const ModerationQueueScreen: React.FC = () => {
  const route = useRoute<ModerationQueueScreenRouteProp>();
  const navigation = useNavigation<ModerationQueueScreenNavigationProp>();
  const {groupId, groupName} = route.params;
  const dispatch = useAppDispatch();

  const reports = useAppSelector(state => selectReportsByGroup(state, groupId));
  const status = useAppSelector(selectReportsStatus);
  const error = useAppSelector(selectReportsError);

  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<ReportStatus | 'all'>(
    'pending',
  );

  useEffect(() => {
    dispatch(fetchGroupReports(groupId));
  }, [dispatch, groupId]);

  useEffect(() => {
    navigation.setOptions({
      title: 'Moderation Queue',
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.navigate('UserBans', {groupId, groupName})}>
          <Icon name="account-cancel" size={24} color="#2196F3" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, groupId, groupName]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await dispatch(fetchGroupReports(groupId)).unwrap();
    } catch (err) {
      console.error('Error refreshing reports:', err);
    } finally {
      setRefreshing(false);
    }
  }, [dispatch, groupId]);

  const handleReportPress = (report: Report) => {
    navigation.navigate('ReportDetail', {
      reportId: report.id,
      groupId,
      groupName,
    });
  };

  const filteredReports =
    selectedFilter === 'all'
      ? reports
      : reports.filter(r => r.status === selectedFilter);

  const pendingCount = reports.filter(r => r.status === 'pending').length;

  const renderFilterChip = ({
    label,
    value,
  }: {
    label: string;
    value: ReportStatus | 'all';
  }) => {
    const isSelected = selectedFilter === value;
    const count =
      value === 'all'
        ? reports.length
        : reports.filter(r => r.status === value).length;

    return (
      <TouchableOpacity
        key={value}
        style={[styles.filterChip, isSelected && styles.filterChipSelected]}
        onPress={() => setSelectedFilter(value)}>
        <Text
          style={[
            styles.filterChipText,
            isSelected && styles.filterChipTextSelected,
          ]}>
          {label} ({count})
        </Text>
      </TouchableOpacity>
    );
  };

  const renderReportItem = ({item}: {item: Report}) => (
    <TouchableOpacity
      style={styles.reportCard}
      onPress={() => handleReportPress(item)}
      activeOpacity={0.7}>
      <View style={styles.reportHeader}>
        <View style={styles.reportIconContainer}>
          <Icon
            name={getContentTypeIcon(item.contentType)}
            size={24}
            color="#666"
          />
        </View>
        <View style={styles.reportInfo}>
          <Text style={styles.reportedUserName}>{item.reportedUserName}</Text>
          <Text style={styles.reporterInfo}>
            Reported by {item.reporterName}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {backgroundColor: getStatusColor(item.status) + '20'},
          ]}>
          <Text
            style={[
              styles.statusBadgeText,
              {color: getStatusColor(item.status)},
            ]}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
        </View>
      </View>

      <View style={styles.reportBody}>
        <View style={styles.reasonContainer}>
          <Icon name="alert-circle" size={16} color="#FF9800" />
          <Text style={styles.reasonText}>{getReasonLabel(item.reason)}</Text>
        </View>

        {item.contentSnapshot && (
          <Text style={styles.contentPreview} numberOfLines={2}>
            "{item.contentSnapshot}"
          </Text>
        )}

        {item.description && (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </View>

      <View style={styles.reportFooter}>
        <Text style={styles.timeAgo}>
          {formatDistanceToNow(item.createdAt, {addSuffix: true})}
        </Text>
        <View style={styles.viewDetailsContainer}>
          <Text style={styles.viewDetailsText}>View Details</Text>
          <Icon name="chevron-right" size={16} color="#2196F3" />
        </View>
      </View>
    </TouchableOpacity>
  );

  if (status === 'loading' && reports.length === 0) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading reports...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Summary */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryCount}>{pendingCount}</Text>
          <Text style={styles.summaryLabel}>Pending Review</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryCount}>{reports.length}</Text>
          <Text style={styles.summaryLabel}>Total Reports</Text>
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        {STATUS_FILTERS.map(filter => renderFilterChip(filter))}
      </View>

      {/* Reports List */}
      <FlatList
        data={filteredReports}
        renderItem={renderReportItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="check-circle" size={64} color="#4CAF50" />
            <Text style={styles.emptyTitle}>
              {selectedFilter === 'pending'
                ? 'No pending reports'
                : 'No reports found'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {selectedFilter === 'pending'
                ? 'All reports have been reviewed'
                : 'No reports match this filter'}
            </Text>
          </View>
        }
      />

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
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
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#757575',
  },
  headerButton: {
    padding: 8,
    marginRight: 8,
  },
  summaryContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryCount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#212121',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#757575',
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E5E5E5',
    marginHorizontal: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
  },
  filterChipSelected: {
    backgroundColor: '#E3F2FD',
  },
  filterChipText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  filterChipTextSelected: {
    color: '#2196F3',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  reportCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reportIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportInfo: {
    flex: 1,
    marginLeft: 12,
  },
  reportedUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  reporterInfo: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reportBody: {
    marginBottom: 12,
  },
  reasonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  reasonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FF9800',
    marginLeft: 6,
  },
  contentPreview: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    backgroundColor: '#F8F8F8',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#757575',
  },
  reportFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  timeAgo: {
    fontSize: 12,
    color: '#999',
  },
  viewDetailsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewDetailsText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#757575',
    marginTop: 8,
    textAlign: 'center',
  },
  errorContainer: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  errorText: {
    color: '#C62828',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default ModerationQueueScreen;
