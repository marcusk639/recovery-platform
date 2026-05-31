import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  FlatList,
  Modal,
  TextInput,
} from 'react-native';
import {useRoute, RouteProp, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {GroupStackParamList} from '../../types/navigation';
import {HomeGroup} from '../../types';
import {Transaction} from '../../types/domain/treasury';
import {useAppDispatch, useAppSelector} from '../../store';
import EditTransactionModal from '../../components/treasury/EditTransactionModal';
import {
  fetchGroupById,
  selectGroupById,
  selectGroupsStatus,
  selectGroupsError,
} from '../../store/slices/groupsSlice';
import {
  fetchGroupTransactions,
  selectGroupTransactions,
  selectTransactionsStatus,
  selectTransactionsError,
} from '../../store/slices/transactionsSlice';
import {
  fetchTreasuryStats,
  selectTreasuryStatsByGroupId,
  selectTreasuryStatus,
  selectTreasuryError,
  updatePrudentReserve,
} from '../../store/slices/treasurySlice';
import {
  fetchServicePositionsForGroup,
  selectIsTreasurerForGroup,
  selectServicePositionsByGroup,
} from '../../store/slices/servicePositionsSlice';
import {selectMembersByGroupId} from '../../store/slices/membersSlice';
import {
  fetchPendingHandoffsForUser,
  fetchAcceptedHandoffsForUser,
  selectPendingHandoffsForUser,
  selectAcceptedHandoffsForUser,
} from '../../store/slices/treasurerHandoffSlice';
import FeatureTooltip from '../../components/subscription/FeatureTooltip';
import AskAdminUpgradeModal from '../../components/payments/AskAdminUpgradeModal';
import {FEATURE_FLAGS} from '../../config/featureFlags';
import {useTrialStatus} from '../../hooks/useTrialStatus';

type GroupTreasuryScreenRouteProp = RouteProp<
  GroupStackParamList,
  'GroupTreasury'
>;

type GroupTreasuryScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'GroupTreasury'
>;

interface TreasuryStats {
  balance: number;
  prudentReserve: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  lastUpdated: Date;
  groupId?: string;
  lastMonthReset?: Date;
}

const GroupTreasuryScreen: React.FC = () => {
  const route = useRoute<GroupTreasuryScreenRouteProp>();
  const navigation = useNavigation<GroupTreasuryScreenNavigationProp>();
  const {groupId, groupName} = route.params;
  const dispatch = useAppDispatch();
  const currentUser = auth().currentUser;

  // Get data from Redux store
  const group = useAppSelector(state => selectGroupById(state, groupId));
  const transactions = useAppSelector(state =>
    selectGroupTransactions(state, groupId),
  );
  const treasuryStats = useAppSelector(state =>
    selectTreasuryStatsByGroupId(state, groupId),
  );

  // Get treasurer status from service positions (cached Redux selector)
  const isTreasurerFromPosition = useAppSelector(state =>
    selectIsTreasurerForGroup(state, groupId, currentUser?.uid || ''),
  );

  // Get service positions to find treasurer position ID
  const servicePositions = useAppSelector(state =>
    selectServicePositionsByGroup(state, groupId),
  );
  const treasurerPosition = servicePositions.find(
    p =>
      p.name.toLowerCase() === 'treasurer' &&
      p.currentHolderId === currentUser?.uid,
  );

  // Derive admin display name for the "Ask Admin" modal — use first available admin member
  const groupMembers = useAppSelector(state =>
    selectMembersByGroupId(state, groupId),
  );
  const firstAdminDisplayName: string | undefined = (() => {
    const adminUids = group?.admins || [];
    if (adminUids.length === 0) return undefined;
    const adminMember = groupMembers.find(m => adminUids.includes(m.userId));
    return adminMember?.name || undefined;
  })();

  // Get pending handoff requests for this user
  const pendingHandoffs = useAppSelector(selectPendingHandoffsForUser);
  const acceptedHandoffs = useAppSelector(selectAcceptedHandoffsForUser);
  const pendingForThisGroup = pendingHandoffs.filter(
    h => h.groupId === groupId,
  );
  const acceptedForThisGroup = acceptedHandoffs.filter(
    h => h.groupId === groupId,
  );

  // Get loading and error states
  const groupsStatus = useAppSelector(selectGroupsStatus);
  const groupsError = useAppSelector(selectGroupsError);
  const transactionsStatus = useAppSelector(selectTransactionsStatus);
  const transactionsError = useAppSelector(selectTransactionsError);
  const treasuryStatus = useAppSelector(selectTreasuryStatus);
  const treasuryError = useAppSelector(selectTreasuryError);

  const isLoading =
    groupsStatus === 'loading' ||
    transactionsStatus === 'loading' ||
    treasuryStatus === 'loading' ||
    !group ||
    !treasuryStats;

  const refreshing =
    transactionsStatus === 'loading' || treasuryStatus === 'loading';

  const [isAdmin, setIsAdmin] = useState(false);
  const [askAdminModalVisible, setAskAdminModalVisible] = useState(false);
  const [reserveModalVisible, setReserveModalVisible] = useState(false);
  const [reserveInput, setReserveInput] = useState('');
  const [savingReserve, setSavingReserve] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);

  const trialStatus = useTrialStatus(groupId);
  const isSubscriptionActive =
    (trialStatus.isInTrial && !trialStatus.isExpired) || trialStatus.isActive;

  const handleAddTransaction = () => {
    if (!isSubscriptionActive) {
      navigation.navigate('SubscriptionUpgrade', {groupId, groupName});
      return;
    }
    navigation.navigate('AddTransaction', {groupId, groupName});
  };

  // Combine service position treasurer status with legacy treasurers array
  // This ensures backward compatibility during migration
  const isTreasurer =
    isTreasurerFromPosition ||
    (group?.treasurers?.includes(currentUser?.uid || '') ?? false);

  useEffect(() => {
    loadGroupData();
    // Fetch handoff data for current user
    if (currentUser?.uid) {
      dispatch(fetchPendingHandoffsForUser(currentUser.uid));
      dispatch(fetchAcceptedHandoffsForUser(currentUser.uid));
    }
  }, [groupId, currentUser?.uid]);

  useEffect(() => {
    if (group) {
      checkUserPermissions(group);
    }
  }, [group]);

  useEffect(() => {
    const error = groupsError || transactionsError || treasuryError;
    if (error) {
      Alert.alert('Error', error);
    }
  }, [groupsError, transactionsError, treasuryError]);

  const loadGroupData = async () => {
    if (!currentUser) {
      Alert.alert('Error', 'You must be logged in to view treasury');
      return;
    }

    if (!group || groupsStatus === 'idle') {
      dispatch(fetchGroupById(groupId));
    }

    // Fetch service positions for treasurer check (uses cached data if available)
    dispatch(fetchServicePositionsForGroup(groupId));

    loadTreasuryData();
  };

  const loadTreasuryData = async () => {
    if (transactions.length === 0 || transactionsStatus === 'idle') {
      dispatch(fetchGroupTransactions({groupId}));
    }

    if (!treasuryStats || treasuryStatus === 'idle') {
      dispatch(fetchTreasuryStats(groupId));
    }
  };

  const checkUserPermissions = (groupData: HomeGroup) => {
    if (!currentUser) return;

    const isUserAdmin = groupData.admins.includes(currentUser.uid);
    setIsAdmin(isUserAdmin);
    // isTreasurer is now derived from Redux selector, no need to set it here
  };

  const onRefresh = () => {
    loadTreasuryData();
  };

  const handleOpenReserveModal = () => {
    setReserveInput(treasuryStats?.prudentReserve?.toString() || '600');
    setReserveModalVisible(true);
  };

  const handleSavePrudentReserve = async () => {
    const value = parseFloat(reserveInput);
    if (isNaN(value) || value < 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (value > 10000) {
      Alert.alert('Error', 'Prudent reserve cannot exceed $10,000');
      return;
    }

    setSavingReserve(true);
    try {
      await dispatch(updatePrudentReserve({groupId, amount: value})).unwrap();
      // Refresh treasury stats to get updated value
      dispatch(fetchTreasuryStats(groupId));
      setReserveModalVisible(false);
      Alert.alert('Success', 'Prudent reserve updated');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update prudent reserve');
    } finally {
      setSavingReserve(false);
    }
  };

  const handleTransactionPress = (transaction: Transaction) => {
    if (isAdmin || isTreasurer) {
      setSelectedTransaction(transaction);
      setEditModalVisible(true);
    }
  };

  const handleCloseEditModal = () => {
    setEditModalVisible(false);
    setSelectedTransaction(null);
    // Refresh transactions list to ensure Firestore sync
    // Note: treasury stats are already refreshed by EditTransactionModal on save
    dispatch(fetchGroupTransactions({groupId}));
  };

  const renderTransactionItem = ({item}: {item: Transaction}) => (
    <TouchableOpacity
      style={styles.transactionItem}
      testID={`transaction-item-${item.id}`}
      onPress={() => handleTransactionPress(item)}
      disabled={!isAdmin && !isTreasurer}
      activeOpacity={isAdmin || isTreasurer ? 0.7 : 1}>
      <View style={styles.transactionHeader}>
        <Text style={styles.transactionDate}>
          {item.createdAt?.toLocaleDateString()}
        </Text>
        <Text
          style={[
            styles.transactionAmount,
            {color: item.type === 'income' ? '#4CAF50' : '#F44336'},
          ]}>
          {item.type === 'income' ? '+' : '-'}$
          {Math.abs(item.amount).toFixed(2)}
        </Text>
      </View>
      <Text style={styles.transactionCategory}>{item.category}</Text>
      <Text style={styles.transactionDescription}>{item.description}</Text>
    </TouchableOpacity>
  );

  const renderTreasurySummary = () => {
    if (!treasuryStats) return null;

    return (
      <View style={styles.summaryContainer} testID="treasury-summary-section">
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Current Balance</Text>
            <Text style={styles.summaryValue}>
              ${treasuryStats.balance.toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <View style={styles.reserveLabelRow}>
              <Text style={styles.summaryLabel}>Prudent Reserve</Text>
              {(isAdmin || isTreasurer) && (
                <TouchableOpacity
                  onPress={handleOpenReserveModal}
                  style={styles.editReserveButton}
                  testID="edit-prudent-reserve-button">
                  <Icon name="pencil" size={14} color="#1976D2" />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.summaryValue}>
              ${treasuryStats.prudentReserve.toFixed(2)}
            </Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Monthly Income</Text>
            <Text style={[styles.summaryValue, {color: '#4CAF50'}]}>
              ${treasuryStats.monthlyIncome.toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Monthly Expenses</Text>
            <Text style={[styles.summaryValue, {color: '#F44336'}]}>
              ${treasuryStats.monthlyExpenses.toFixed(2)}
            </Text>
          </View>
        </View>
        <Text style={styles.lastUpdated}>
          Last updated: {treasuryStats.lastUpdated.toLocaleDateString()}
        </Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading treasury data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
      testID={`group-treasury-screen-${groupId}`}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        {(isAdmin || isTreasurer) && !isSubscriptionActive && (
          <TouchableOpacity
            style={styles.subscriptionExpiredBanner}
            onPress={() =>
              navigation.navigate('SubscriptionUpgrade', {groupId, groupName})
            }
            testID="treasury-subscription-expired-banner">
            <Icon name="alert-circle-outline" size={16} color="#fff" />
            <Text style={styles.subscriptionExpiredText}>
              Subscription expired — tap to renew
            </Text>
          </TouchableOpacity>
        )}

        {renderTreasurySummary()}

        {/* Ask Admin prompt — visible to non-admin, non-treasurer members */}
        {!isAdmin && !isTreasurer && (
          <TouchableOpacity
            style={styles.askAdminBanner}
            onPress={() => setAskAdminModalVisible(true)}
            testID="treasury-ask-admin-upgrade-button">
            <Icon name="star-circle-outline" size={18} color="#FFA000" />
            <Text style={styles.askAdminBannerText}>
              Want to manage treasury? Ask your admin to enable it.
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.actionsContainer}>
          {(isAdmin || isTreasurer) && (
            <>
              <FeatureTooltip
                featureId="treasury_add"
                title="Premium Feature: Treasury"
                description="Track income, expenses, and generate reports. Included in your subscription!">
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleAddTransaction}
                  testID="treasury-add-transaction-button">
                  <Icon
                    name="plus-circle-outline"
                    size={20}
                    color="#1976D2"
                    style={styles.actionIcon}
                  />
                  <Text style={styles.actionButtonText}>Add Transaction</Text>
                </TouchableOpacity>
              </FeatureTooltip>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() =>
                  navigation.navigate('TreasuryReport', {
                    groupId,
                    groupName,
                  })
                }
                testID="treasury-generate-report-button">
                <Icon
                  name="file-chart"
                  size={20}
                  color="#1976D2"
                  style={styles.actionIcon}
                />
                <Text style={styles.actionButtonText}>Generate Report</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Saved Reports Section */}
        {(isAdmin || isTreasurer) && (
          <TouchableOpacity
            style={styles.savedReportsButton}
            onPress={() =>
              navigation.navigate('SavedTreasuryReports', {
                groupId,
                groupName,
              })
            }
            testID="treasury-saved-reports-button">
            <Icon name="history" size={20} color="#757575" />
            <Text style={styles.savedReportsButtonText}>
              View Saved Reports
            </Text>
            <Icon name="chevron-right" size={20} color="#9E9E9E" />
          </TouchableOpacity>
        )}

        {/* Manage Recurring Transactions */}
        {(isAdmin || isTreasurer) && (
          <TouchableOpacity
            style={styles.savedReportsButton}
            onPress={() =>
              navigation.navigate('ManageRecurring', {groupId, groupName})
            }
            testID="treasury-manage-recurring-button">
            <Icon name="repeat" size={20} color="#2196F3" />
            <Text style={styles.savedReportsButtonText}>Manage Recurring</Text>
            <Icon name="chevron-right" size={20} color="#9E9E9E" />
          </TouchableOpacity>
        )}

        {/* Year-End Summary */}
        {(isAdmin || isTreasurer) && (
          <TouchableOpacity
            style={styles.savedReportsButton}
            onPress={() =>
              navigation.navigate('YearEndSummary', {groupId, groupName})
            }
            testID="treasury-year-end-summary-button">
            <Icon name="file-chart" size={20} color="#2196F3" />
            <Text style={styles.savedReportsButtonText}>Year-End Summary</Text>
            <Icon name="chevron-right" size={20} color="#9E9E9E" />
          </TouchableOpacity>
        )}

        {/* Trends & Reports — V4.3, hidden (premature; no data until groups have history) */}
        {isAdmin && FEATURE_FLAGS.SHOW_V4_ANALYTICS_TREASURY_TRENDS && (
          <TouchableOpacity
            style={styles.savedReportsButton}
            onPress={() =>
              navigation.navigate('TreasuryTrends', {groupId, groupName})
            }
            testID="treasury-trends-button">
            <Icon name="chart-areaspline" size={20} color="#F57C00" />
            <Text style={styles.savedReportsButtonText}>
              Trends &amp; Reports
            </Text>
            <Icon name="chevron-right" size={20} color="#9E9E9E" />
          </TouchableOpacity>
        )}

        {/* Pending Handoff Requests */}
        {pendingForThisGroup.length > 0 && (
          <View style={styles.handoffAlertSection}>
            <View style={styles.handoffAlertHeader}>
              <Icon name="account-switch" size={20} color="#FF9800" />
              <Text style={styles.handoffAlertTitle}>
                Pending Handoff Request
              </Text>
            </View>
            {pendingForThisGroup.map(handoff => (
              <TouchableOpacity
                key={handoff.id}
                style={styles.handoffAlertCard}
                onPress={() =>
                  navigation.navigate('HandoffRequest', {
                    groupId,
                    groupName,
                    handoffId: handoff.id,
                  })
                }>
                <Text style={styles.handoffAlertText}>
                  {handoff.previousTreasurerName} wants to transfer the
                  treasurer role to you
                </Text>
                <View style={styles.handoffAlertAction}>
                  <Text style={styles.handoffAlertActionText}>
                    Review Request
                  </Text>
                  <Icon name="chevron-right" size={16} color="#1976D2" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Accepted Handoffs awaiting completion */}
        {acceptedForThisGroup.length > 0 && (
          <View style={styles.handoffAlertSection}>
            <View style={styles.handoffAlertHeader}>
              <Icon name="check-circle" size={20} color="#4CAF50" />
              <Text style={styles.handoffAlertTitle}>
                Ready to Complete Handoff
              </Text>
            </View>
            {acceptedForThisGroup.map(handoff => (
              <TouchableOpacity
                key={handoff.id}
                style={styles.handoffAlertCard}
                onPress={() =>
                  navigation.navigate('HandoffConfirmation', {
                    groupId,
                    groupName,
                    handoffId: handoff.id,
                  })
                }>
                <Text style={styles.handoffAlertText}>
                  {handoff.newTreasurerName} has accepted. Complete the
                  transfer.
                </Text>
                <View style={styles.handoffAlertAction}>
                  <Text style={styles.handoffAlertActionText}>
                    Complete Handoff
                  </Text>
                  <Icon name="chevron-right" size={16} color="#4CAF50" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Treasurer Actions */}
        {isTreasurer && treasurerPosition && (
          <View style={styles.treasurerActionsSection}>
            <TouchableOpacity
              style={styles.handoffButton}
              onPress={() =>
                navigation.navigate('InitiateHandoff', {
                  groupId,
                  groupName,
                  positionId: treasurerPosition.id,
                })
              }
              testID="treasury-initiate-handoff-button">
              <Icon name="account-switch" size={20} color="#1976D2" />
              <Text style={styles.handoffButtonText}>Transfer Role</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.historyButton}
              onPress={() =>
                navigation.navigate('HandoffHistory', {
                  groupId,
                  groupName,
                })
              }
              testID="view-handoff-history-button">
              <Icon name="clipboard-text-clock" size={20} color="#757575" />
              <Text style={styles.historyButtonText}>Handoff History</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.transactionsContainer}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          {transactions.length > 0 ? (
            <FlatList
              data={transactions}
              renderItem={renderTransactionItem}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              testID="treasury-transactions-list"
            />
          ) : (
            <View
              style={styles.emptyContainer}
              testID="treasury-no-transactions">
              <Icon
                name="cash-multiple"
                size={64}
                color="#BBDEFB"
                style={styles.emptyIcon}
              />
              <Text style={styles.emptyTitle}>No Transactions Yet</Text>
              <Text style={styles.emptyText}>
                {isAdmin || isTreasurer
                  ? "Start tracking your group's finances by adding a new transaction."
                  : 'No transactions have been recorded for this group yet.'}
              </Text>
              {(isAdmin || isTreasurer) && (
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={handleAddTransaction}>
                  <Text style={styles.addButtonText}>Add Transaction</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Prudent Reserve Edit Modal */}
      <Modal
        visible={reserveModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setReserveModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Prudent Reserve</Text>
            <Text style={styles.modalDescription}>
              Set your group's prudent reserve goal. Most groups use $200-$2,000
              (typically 2-3 months of expenses).
            </Text>
            <View style={styles.reserveInputContainer}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.reserveInput}
                value={reserveInput}
                onChangeText={setReserveInput}
                keyboardType="decimal-pad"
                placeholder="600"
                testID="prudent-reserve-input"
              />
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setReserveModalVisible(false)}
                disabled={savingReserve}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSaveButton,
                  savingReserve && styles.modalSaveButtonDisabled,
                ]}
                onPress={handleSavePrudentReserve}
                disabled={savingReserve}
                testID="save-prudent-reserve-button">
                {savingReserve ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Transaction Modal */}
      <EditTransactionModal
        visible={editModalVisible}
        transaction={selectedTransaction}
        groupId={groupId}
        onClose={handleCloseEditModal}
      />

      {/* Ask Admin to Upgrade Modal */}
      <AskAdminUpgradeModal
        visible={askAdminModalVisible}
        onClose={() => setAskAdminModalVisible(false)}
        groupId={groupId}
        adminName={firstAdminDisplayName}
        featureName="Treasury Management"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  askAdminBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FFA000',
    gap: 8,
  },
  askAdminBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#5D4037',
    lineHeight: 18,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#757575',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 0,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionIcon: {
    marginRight: 8,
  },
  actionButtonText: {
    color: '#1976D2',
    fontWeight: '600',
    fontSize: 14,
  },
  donateButton: {
    borderColor: '#4CAF50',
  },
  donateButtonText: {
    color: '#4CAF50',
  },
  summaryContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
  },
  lastUpdated: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
    marginTop: 8,
  },
  transactionsContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 16,
  },
  transactionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 14,
    color: '#757575',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  transactionCategory: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  transactionDescription: {
    fontSize: 14,
    color: '#757575',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginTop: 16,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 16,
  },
  addButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 4,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  savedReportsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  savedReportsButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#424242',
    marginLeft: 12,
  },
  // Handoff styles
  handoffAlertSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  handoffAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  handoffAlertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginLeft: 8,
  },
  handoffAlertCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  handoffAlertText: {
    fontSize: 14,
    color: '#424242',
    marginBottom: 8,
  },
  handoffAlertAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  handoffAlertActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976D2',
    marginRight: 4,
  },
  treasurerActionsSection: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  handoffButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
  },
  handoffButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976D2',
    marginLeft: 8,
  },
  historyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
  },
  historyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
    marginLeft: 8,
  },
  // Prudent Reserve Edit styles
  reserveLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editReserveButton: {
    marginLeft: 6,
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: '#757575',
    lineHeight: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  reserveInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  currencySymbol: {
    fontSize: 18,
    color: '#424242',
    marginRight: 4,
  },
  reserveInput: {
    flex: 1,
    fontSize: 18,
    color: '#212121',
    paddingVertical: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 12,
  },
  modalCancelText: {
    color: '#757575',
    fontWeight: '600',
    fontSize: 16,
  },
  modalSaveButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 80,
    alignItems: 'center',
  },
  modalSaveButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  subscriptionExpiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D32F2F',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  subscriptionExpiredText: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
});

export default GroupTreasuryScreen;
