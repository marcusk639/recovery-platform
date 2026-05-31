import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import {useRoute, RouteProp} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';

import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchHandoffHistory,
  selectHandoffsByGroup,
  selectHandoffStatus,
} from '../../store/slices/treasurerHandoffSlice';
import {TreasurerHandoff, HandoffStatus} from '../../types/domain/treasurer-handoff';

type HandoffHistoryScreenRouteProp = RouteProp<
  GroupStackParamList,
  'HandoffHistory'
>;

const HandoffHistoryScreen: React.FC = () => {
  const route = useRoute<HandoffHistoryScreenRouteProp>();
  const dispatch = useAppDispatch();
  const {groupId} = route.params;

  // State
  const [refreshing, setRefreshing] = useState(false);

  // Redux selectors
  const handoffs = useAppSelector(state =>
    selectHandoffsByGroup(state, groupId),
  );
  const status = useAppSelector(selectHandoffStatus);
  const isLoading = status === 'loading' && handoffs.length === 0;

  // Load handoff history
  useEffect(() => {
    dispatch(fetchHandoffHistory(groupId));
  }, [dispatch, groupId]);

  // Handle refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchHandoffHistory(groupId));
    setRefreshing(false);
  };

  // Format currency
  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

  // Get status config
  const getStatusConfig = (
    handoffStatus: HandoffStatus,
  ): {color: string; bgColor: string; icon: string; label: string} => {
    switch (handoffStatus) {
      case 'completed':
        return {
          color: '#2E7D32',
          bgColor: '#E8F5E9',
          icon: 'check-circle',
          label: 'Completed',
        };
      case 'pending':
        return {
          color: '#F57C00',
          bgColor: '#FFF3E0',
          icon: 'clock-outline',
          label: 'Pending',
        };
      case 'accepted':
        return {
          color: '#1565C0',
          bgColor: '#E3F2FD',
          icon: 'check',
          label: 'Accepted',
        };
      case 'rejected':
        return {
          color: '#C62828',
          bgColor: '#FFEBEE',
          icon: 'close-circle',
          label: 'Declined',
        };
      case 'cancelled':
        return {
          color: '#757575',
          bgColor: '#F5F5F5',
          icon: 'cancel',
          label: 'Cancelled',
        };
      default:
        return {
          color: '#757575',
          bgColor: '#F5F5F5',
          icon: 'help-circle',
          label: 'Unknown',
        };
    }
  };

  // Render handoff item
  const renderHandoffItem = ({item}: {item: TreasurerHandoff}) => {
    const statusConfig = getStatusConfig(item.status);

    return (
      <View style={styles.handoffCard}>
        {/* Header with date and status */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardDate}>
            {format(new Date(item.createdAt), 'MMMM d, yyyy')}
          </Text>
          <View
            style={[
              styles.statusBadge,
              {backgroundColor: statusConfig.bgColor},
            ]}>
            <Icon name={statusConfig.icon} size={14} color={statusConfig.color} />
            <Text style={[styles.statusText, {color: statusConfig.color}]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        {/* Transfer info */}
        <View style={styles.transferInfo}>
          <View style={styles.personColumn}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.previousTreasurerName.charAt(0)}
              </Text>
            </View>
            <Text style={styles.personName} numberOfLines={1}>
              {item.previousTreasurerName}
            </Text>
            <Text style={styles.personLabel}>From</Text>
          </View>

          <View style={styles.arrowContainer}>
            <Icon name="arrow-right" size={20} color="#757575" />
          </View>

          <View style={styles.personColumn}>
            <View style={[styles.avatar, styles.avatarNew]}>
              <Text style={styles.avatarText}>
                {item.newTreasurerName.charAt(0)}
              </Text>
            </View>
            <Text style={styles.personName} numberOfLines={1}>
              {item.newTreasurerName}
            </Text>
            <Text style={styles.personLabel}>To</Text>
          </View>
        </View>

        {/* Balance at handoff */}
        <View style={styles.balanceSection}>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Balance at Handoff</Text>
            <Text style={styles.balanceValue}>
              {formatCurrency(item.balanceAtHandoff)}
            </Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Prudent Reserve</Text>
            <Text style={styles.balanceValueSecondary}>
              {formatCurrency(item.prudentReserveAtHandoff)}
            </Text>
          </View>
        </View>

        {/* Transition notes if present */}
        {item.transitionNotes && (
          <View style={styles.notesSection}>
            <Icon name="note-text" size={14} color="#757575" />
            <Text style={styles.notesText} numberOfLines={2}>
              {item.transitionNotes}
            </Text>
          </View>
        )}

        {/* Rejection reason if rejected */}
        {item.status === 'rejected' && item.rejectionReason && (
          <View style={styles.rejectionSection}>
            <Icon name="message-alert" size={14} color="#C62828" />
            <Text style={styles.rejectionText}>{item.rejectionReason}</Text>
          </View>
        )}

        {/* Completion date if completed */}
        {item.status === 'completed' && item.completedAt && (
          <View style={styles.completionSection}>
            <Icon name="check-circle" size={14} color="#2E7D32" />
            <Text style={styles.completionText}>
              Completed on {format(new Date(item.completedAt), 'MMM d, yyyy h:mm a')}
            </Text>
          </View>
        )}
      </View>
    );
  };

  // Empty state
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon name="history" size={64} color="#E0E0E0" />
      <Text style={styles.emptyTitle}>No Handoff History</Text>
      <Text style={styles.emptyText}>
        When treasurer role transfers occur, they will be recorded here for
        accountability and reference.
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
          <Text style={styles.loadingText}>Loading handoff history...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={handoffs}
        renderItem={renderHandoffItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={renderEmptyState}
        ListHeaderComponent={
          handoffs.length > 0 ? (
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderText}>
                {handoffs.length} handoff{handoffs.length !== 1 ? 's' : ''} recorded
              </Text>
            </View>
          ) : null
        }
      />
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#757575',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  listHeader: {
    marginBottom: 12,
  },
  listHeaderText: {
    fontSize: 14,
    color: '#757575',
  },
  handoffCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  transferInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  personColumn: {
    flex: 1,
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#9E9E9E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarNew: {
    backgroundColor: '#1976D2',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  personName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#212121',
    marginTop: 6,
    textAlign: 'center',
  },
  personLabel: {
    fontSize: 11,
    color: '#9E9E9E',
    marginTop: 2,
  },
  arrowContainer: {
    paddingHorizontal: 8,
  },
  balanceSection: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  balanceLabel: {
    fontSize: 13,
    color: '#757575',
  },
  balanceValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
  },
  balanceValueSecondary: {
    fontSize: 13,
    color: '#757575',
  },
  notesSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  notesText: {
    flex: 1,
    fontSize: 13,
    color: '#616161',
    marginLeft: 8,
    fontStyle: 'italic',
  },
  rejectionSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    padding: 10,
    backgroundColor: '#FFEBEE',
    borderRadius: 6,
  },
  rejectionText: {
    flex: 1,
    fontSize: 13,
    color: '#C62828',
    marginLeft: 8,
  },
  completionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  completionText: {
    fontSize: 12,
    color: '#2E7D32',
    marginLeft: 6,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});

export default HandoffHistoryScreen;

