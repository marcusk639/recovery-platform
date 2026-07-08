import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useRoute, RouteProp, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';

import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchHandoffById,
  completeHandoff,
  cancelHandoff,
  selectHandoffById,
  selectHandoffStatus,
} from '../../store/slices/treasurerHandoffSlice';
import {
  selectTreasuryStatsByGroupId,
  fetchTreasuryStats,
} from '../../store/slices/treasurySlice';
import {selectGroupById} from '../../store/slices/groupsSlice';

const UPSELL_DISMISSED_KEY = 'handoff_upsell_dismissed_at';
const UPSELL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type HandoffConfirmationScreenRouteProp = RouteProp<
  GroupStackParamList,
  'HandoffConfirmation'
>;

type HandoffConfirmationScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'HandoffConfirmation'
>;

const HandoffConfirmationScreen: React.FC = () => {
  const route = useRoute<HandoffConfirmationScreenRouteProp>();
  const navigation = useNavigation<HandoffConfirmationScreenNavigationProp>();
  const dispatch = useAppDispatch();
  const {groupId, groupName, handoffId} = route.params;

  // State
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(false);

  // Redux selectors
  const handoff = useAppSelector(state => selectHandoffById(state, handoffId));
  const status = useAppSelector(selectHandoffStatus);
  const currentStats = useAppSelector(state =>
    selectTreasuryStatsByGroupId(state, groupId),
  );
  const group = useAppSelector(state => selectGroupById(state, groupId));
  const isLoading = status === 'loading' && !handoff;

  // Load data
  useEffect(() => {
    dispatch(fetchHandoffById({groupId, handoffId}));
    dispatch(fetchTreasuryStats(groupId));
  }, [dispatch, groupId, handoffId]);

  // Format currency
  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

  // Calculate balance change since handoff initiated
  const balanceChange = currentStats
    ? currentStats.balance - (handoff?.balanceAtHandoff || 0)
    : 0;

  // Handle complete handoff
  const handleComplete = async () => {
    Alert.alert(
      'Complete Handoff',
      `This will transfer the treasurer role to ${
        handoff?.newTreasurerName
      }.\n\nCurrent Balance: ${formatCurrency(
        currentStats?.balance || 0,
      )}\n\nThis action cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Complete Transfer',
          style: 'destructive',
          onPress: async () => {
            setIsCompleting(true);
            try {
              await dispatch(completeHandoff({groupId, handoffId})).unwrap();
              Alert.alert(
                'Handoff Complete!',
                `${handoff?.newTreasurerName} is now the treasurer for ${groupName}.`,
                [
                  {
                    text: 'OK',
                    onPress: async () => {
                      if (!group?.isClaimed) {
                        const dismissedAt = await AsyncStorage.getItem(
                          UPSELL_DISMISSED_KEY,
                        );
                        const shouldShow =
                          !dismissedAt ||
                          Date.now() - Number(dismissedAt) > UPSELL_SNOOZE_MS;
                        if (shouldShow) {
                          setPendingNavigation(true);
                          setShowUpsell(true);
                          return;
                        }
                      }
                      navigation.navigate('GroupTreasury', {groupId, groupName});
                    },
                  },
                ],
              );
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.message || 'Failed to complete handoff',
              );
            } finally {
              setIsCompleting(false);
            }
          },
        },
      ],
    );
  };

  // Handle cancel handoff
  const handleCancel = async () => {
    Alert.alert(
      'Cancel Handoff',
      'Are you sure you want to cancel this handoff? You will remain the treasurer.',
      [
        {text: 'No', style: 'cancel'},
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setIsCancelling(true);
            try {
              await dispatch(cancelHandoff({groupId, handoffId})).unwrap();
              Alert.alert(
                'Handoff Cancelled',
                'The handoff has been cancelled.',
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ],
              );
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to cancel handoff');
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
          <Text style={styles.loadingText}>Loading handoff details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!handoff) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Icon name="alert-circle" size={48} color="#F44336" />
          <Text style={styles.errorTitle}>Handoff Not Found</Text>
          <Text style={styles.errorText}>
            This handoff request could not be found.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (handoff.status !== 'accepted') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Icon
            name={
              handoff.status === 'pending'
                ? 'clock-outline'
                : handoff.status === 'completed'
                ? 'check-circle'
                : 'close-circle'
            }
            size={48}
            color={
              handoff.status === 'pending'
                ? '#FF9800'
                : handoff.status === 'completed'
                ? '#4CAF50'
                : '#9E9E9E'
            }
          />
          <Text style={styles.errorTitle}>
            {handoff.status === 'pending'
              ? 'Awaiting Acceptance'
              : handoff.status === 'completed'
              ? 'Handoff Already Complete'
              : handoff.status === 'rejected'
              ? 'Handoff Declined'
              : 'Handoff Cancelled'}
          </Text>
          <Text style={styles.errorText}>
            {handoff.status === 'pending'
              ? `${handoff.newTreasurerName} has not yet accepted the handoff request.`
              : `This handoff has already been ${handoff.status}.`}
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Success Banner */}
        <View style={styles.successBanner}>
          <Icon name="check-circle" size={32} color="#4CAF50" />
          <View style={styles.successBannerText}>
            <Text style={styles.successTitle}>Ready to Complete</Text>
            <Text style={styles.successSubtitle}>
              {handoff.newTreasurerName} has accepted the treasurer role
            </Text>
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Handoff Timeline</Text>
          <View style={styles.timeline}>
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, styles.timelineDotComplete]} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>Initiated</Text>
                <Text style={styles.timelineDate}>
                  {format(new Date(handoff.createdAt), 'MMM d, yyyy h:mm a')}
                </Text>
              </View>
            </View>
            <View style={styles.timelineConnector} />
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, styles.timelineDotComplete]} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>Accepted</Text>
                <Text style={styles.timelineDate}>
                  {handoff.acceptedAt
                    ? format(new Date(handoff.acceptedAt), 'MMM d, yyyy h:mm a')
                    : 'Pending'}
                </Text>
              </View>
            </View>
            <View style={styles.timelineConnector} />
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, styles.timelineDotPending]} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>Complete</Text>
                <Text style={styles.timelineDate}>
                  Awaiting your confirmation
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Balance Comparison */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Balance Summary</Text>
          <View style={styles.balanceComparison}>
            <View style={styles.balanceColumn}>
              <Text style={styles.balanceColumnTitle}>At Initiation</Text>
              <Text style={styles.balanceColumnValue}>
                {formatCurrency(handoff.balanceAtHandoff)}
              </Text>
              <Text style={styles.balanceColumnDate}>
                {format(new Date(handoff.createdAt), 'MMM d')}
              </Text>
            </View>
            <View style={styles.balanceArrow}>
              <Icon name="arrow-right" size={24} color="#757575" />
            </View>
            <View style={styles.balanceColumn}>
              <Text style={styles.balanceColumnTitle}>Current</Text>
              <Text style={styles.balanceColumnValue}>
                {formatCurrency(currentStats?.balance || 0)}
              </Text>
              <Text style={styles.balanceColumnDate}>Today</Text>
            </View>
          </View>
          {balanceChange !== 0 && (
            <View
              style={[
                styles.balanceChangeBanner,
                balanceChange > 0
                  ? styles.balanceChangePositive
                  : styles.balanceChangeNegative,
              ]}>
              <Icon
                name={balanceChange > 0 ? 'trending-up' : 'trending-down'}
                size={16}
                color={balanceChange > 0 ? '#2E7D32' : '#C62828'}
              />
              <Text
                style={[
                  styles.balanceChangeText,
                  balanceChange > 0
                    ? styles.balanceChangeTextPositive
                    : styles.balanceChangeTextNegative,
                ]}>
                {balanceChange > 0 ? '+' : ''}
                {formatCurrency(balanceChange)} since handoff initiated
              </Text>
            </View>
          )}
        </View>

        {/* Transfer Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transfer Details</Text>
          <View style={styles.transferCard}>
            <View style={styles.transferRow}>
              <View style={styles.transferPerson}>
                <View style={styles.personAvatar}>
                  <Text style={styles.personAvatarText}>
                    {handoff.previousTreasurerName.charAt(0)}
                  </Text>
                </View>
                <Text style={styles.personName}>
                  {handoff.previousTreasurerName}
                </Text>
                <Text style={styles.personRole}>Current</Text>
              </View>
              <Icon name="arrow-right" size={24} color="#1976D2" />
              <View style={styles.transferPerson}>
                <View style={[styles.personAvatar, styles.personAvatarNew]}>
                  <Text style={styles.personAvatarText}>
                    {handoff.newTreasurerName.charAt(0)}
                  </Text>
                </View>
                <Text style={styles.personName}>
                  {handoff.newTreasurerName}
                </Text>
                <Text style={styles.personRole}>New</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Transition Notes */}
        {handoff.transitionNotes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Transition Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{handoff.transitionNotes}</Text>
            </View>
          </View>
        )}

        {/* Warning */}
        <View style={styles.warningBanner}>
          <Icon name="alert" size={20} color="#F57C00" />
          <Text style={styles.warningText}>
            Once completed, you will no longer have treasurer access. This
            action cannot be undone.
          </Text>
        </View>
      </ScrollView>

      {/* Subscription upsell modal — shown after first successful handoff */}
      <Modal
        visible={showUpsell}
        transparent
        animationType="slide"
        onRequestClose={() => {}}>
        <View style={styles.upsellOverlay}>
          <View style={styles.upsellCard}>
            <Text style={styles.upsellTitle}>
              Great work completing your handoff!
            </Text>
            <Text style={styles.upsellBody}>
              Keep it going — subscribe for $12/year to unlock annual reports,
              trend analysis, and unlimited handoff history.
            </Text>
            <TouchableOpacity
              style={styles.upsellCta}
              onPress={() => {
                setShowUpsell(false);
                navigation.navigate('SubscriptionUpgrade', {
                  groupId,
                  groupName,
                });
              }}>
              <Text style={styles.upsellCtaText}>Start Free Trial</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.upsellDismiss}
              onPress={async () => {
                await AsyncStorage.setItem(
                  UPSELL_DISMISSED_KEY,
                  String(Date.now()),
                );
                setShowUpsell(false);
                if (pendingNavigation) {
                  navigation.navigate('GroupTreasury', {groupId, groupName});
                }
              }}>
              <Text style={styles.upsellDismissText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          disabled={isCancelling || isCompleting}>
          {isCancelling ? (
            <ActivityIndicator color="#F44336" size="small" />
          ) : (
            <>
              <Icon name="close" size={20} color="#F44336" />
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.completeButton, isCompleting && styles.buttonDisabled]}
          onPress={handleComplete}
          disabled={isCompleting || isCancelling}>
          {isCompleting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Icon name="check-all" size={20} color="#FFFFFF" />
              <Text style={styles.completeButtonText}>Complete Handoff</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#424242',
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginTop: 8,
  },
  backButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#C8E6C9',
  },
  successBannerText: {
    marginLeft: 12,
    flex: 1,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
  },
  successSubtitle: {
    fontSize: 13,
    color: '#388E3C',
    marginTop: 2,
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 12,
  },
  timeline: {
    paddingLeft: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  timelineDotComplete: {
    backgroundColor: '#4CAF50',
  },
  timelineDotPending: {
    backgroundColor: '#E0E0E0',
    borderWidth: 2,
    borderColor: '#1976D2',
  },
  timelineConnector: {
    width: 2,
    height: 24,
    backgroundColor: '#E0E0E0',
    marginLeft: 5,
    marginVertical: 4,
  },
  timelineContent: {
    marginLeft: 12,
    flex: 1,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#212121',
  },
  timelineDate: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  balanceComparison: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
  },
  balanceColumn: {
    alignItems: 'center',
    flex: 1,
  },
  balanceColumnTitle: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 4,
  },
  balanceColumnValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
  },
  balanceColumnDate: {
    fontSize: 11,
    color: '#9E9E9E',
    marginTop: 4,
  },
  balanceArrow: {
    paddingHorizontal: 12,
  },
  balanceChangeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
  },
  balanceChangePositive: {
    backgroundColor: '#E8F5E9',
  },
  balanceChangeNegative: {
    backgroundColor: '#FFEBEE',
  },
  balanceChangeText: {
    fontSize: 13,
    marginLeft: 8,
  },
  balanceChangeTextPositive: {
    color: '#2E7D32',
  },
  balanceChangeTextNegative: {
    color: '#C62828',
  },
  transferCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  transferPerson: {
    alignItems: 'center',
    flex: 1,
  },
  personAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9E9E9E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarNew: {
    backgroundColor: '#1976D2',
  },
  personAvatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  personName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#212121',
    marginTop: 8,
    textAlign: 'center',
  },
  personRole: {
    fontSize: 11,
    color: '#757575',
    marginTop: 2,
  },
  notesCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  notesText: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 20,
  },
  warningBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    margin: 16,
    padding: 12,
    borderRadius: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#E65100',
    marginLeft: 8,
  },
  bottomActions: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  cancelButtonText: {
    color: '#F44336',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  completeButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
  },
  completeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  buttonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  upsellOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  upsellCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  upsellTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  upsellBody: {
    fontSize: 15,
    color: '#616161',
    lineHeight: 22,
    marginBottom: 24,
  },
  upsellCta: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  upsellCtaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  upsellDismiss: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  upsellDismissText: {
    fontSize: 15,
    color: '#757575',
  },
});

export default HandoffConfirmationScreen;
