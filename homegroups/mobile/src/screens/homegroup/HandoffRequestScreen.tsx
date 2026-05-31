import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import {useRoute, RouteProp, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';

import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchHandoffById,
  acceptHandoff,
  rejectHandoff,
  selectHandoffById,
  selectHandoffStatus,
} from '../../store/slices/treasurerHandoffSlice';

type HandoffRequestScreenRouteProp = RouteProp<
  GroupStackParamList,
  'HandoffRequest'
>;

type HandoffRequestScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'HandoffRequest'
>;

const HandoffRequestScreen: React.FC = () => {
  const route = useRoute<HandoffRequestScreenRouteProp>();
  const navigation = useNavigation<HandoffRequestScreenNavigationProp>();
  const dispatch = useAppDispatch();
  const {groupId, groupName, handoffId} = route.params;

  // State
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Redux selectors
  const handoff = useAppSelector(state =>
    selectHandoffById(state, handoffId),
  );
  const status = useAppSelector(selectHandoffStatus);
  const isLoading = status === 'loading' && !handoff;

  // Load handoff data
  useEffect(() => {
    dispatch(fetchHandoffById({groupId, handoffId}));
  }, [dispatch, groupId, handoffId]);

  // Format currency
  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

  // Handle accept
  const handleAccept = async () => {
    Alert.alert(
      'Accept Handoff',
      'By accepting, you agree to take on the treasurer responsibilities for this group. The current treasurer will then confirm the final handoff.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Accept',
          onPress: async () => {
            setIsAccepting(true);
            try {
              await dispatch(acceptHandoff({groupId, handoffId})).unwrap();
              Alert.alert(
                'Handoff Accepted',
                'You have accepted the treasurer role. The current treasurer will complete the handoff.',
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ],
              );
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to accept handoff');
            } finally {
              setIsAccepting(false);
            }
          },
        },
      ],
    );
  };

  // Handle reject
  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await dispatch(
        rejectHandoff({
          groupId,
          handoffId,
          reason: rejectReason.trim() || undefined,
        }),
      ).unwrap();
      Alert.alert(
        'Handoff Declined',
        'You have declined the treasurer role transfer.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to decline handoff');
    } finally {
      setIsRejecting(false);
      setShowRejectModal(false);
    }
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
            This handoff request may have been cancelled or already processed.
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

  if (handoff.status !== 'pending') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Icon
            name={handoff.status === 'accepted' ? 'check-circle' : 'close-circle'}
            size={48}
            color={handoff.status === 'accepted' ? '#4CAF50' : '#9E9E9E'}
          />
          <Text style={styles.errorTitle}>
            {handoff.status === 'accepted'
              ? 'Already Accepted'
              : handoff.status === 'completed'
              ? 'Handoff Complete'
              : handoff.status === 'rejected'
              ? 'Already Declined'
              : 'Handoff Cancelled'}
          </Text>
          <Text style={styles.errorText}>
            This handoff request has already been {handoff.status}.
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
        {/* Header */}
        <View style={styles.header}>
          <Icon name="account-switch" size={48} color="#FF9800" />
          <Text style={styles.headerTitle}>Treasurer Handoff Request</Text>
          <Text style={styles.headerSubtitle}>
            {handoff.previousTreasurerName} wants to transfer the treasurer role
            to you
          </Text>
        </View>

        {/* Group Info */}
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Icon name="account-group" size={20} color="#757575" />
            <Text style={styles.infoLabel}>Group</Text>
            <Text style={styles.infoValue}>{groupName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="calendar" size={20} color="#757575" />
            <Text style={styles.infoLabel}>Requested</Text>
            <Text style={styles.infoValue}>
              {format(new Date(handoff.createdAt), 'MMM d, yyyy h:mm a')}
            </Text>
          </View>
        </View>

        {/* Financial Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial Snapshot at Request</Text>
          <View style={styles.balanceCard}>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Current Balance</Text>
              <Text style={styles.balanceValue}>
                {formatCurrency(handoff.balanceAtHandoff)}
              </Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Prudent Reserve</Text>
              <Text style={styles.balanceValue}>
                {formatCurrency(handoff.prudentReserveAtHandoff)}
              </Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Available Funds</Text>
              <Text style={[styles.balanceValue, styles.balanceHighlight]}>
                {formatCurrency(
                  handoff.balanceAtHandoff - handoff.prudentReserveAtHandoff,
                )}
              </Text>
            </View>
          </View>
        </View>

        {/* Transition Notes */}
        {handoff.transitionNotes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transition Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{handoff.transitionNotes}</Text>
            </View>
          </View>
        )}

        {/* Responsibilities Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Treasurer Responsibilities</Text>
          <View style={styles.responsibilitiesList}>
            <View style={styles.responsibilityItem}>
              <Icon name="check" size={16} color="#4CAF50" />
              <Text style={styles.responsibilityText}>
                Record all income and expenses
              </Text>
            </View>
            <View style={styles.responsibilityItem}>
              <Icon name="check" size={16} color="#4CAF50" />
              <Text style={styles.responsibilityText}>
                Maintain prudent reserve balance
              </Text>
            </View>
            <View style={styles.responsibilityItem}>
              <Icon name="check" size={16} color="#4CAF50" />
              <Text style={styles.responsibilityText}>
                Generate monthly treasury reports
              </Text>
            </View>
            <View style={styles.responsibilityItem}>
              <Icon name="check" size={16} color="#4CAF50" />
              <Text style={styles.responsibilityText}>
                Present reports at business meetings
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Reject Modal */}
      {showRejectModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Decline Handoff</Text>
            <Text style={styles.modalSubtitle}>
              Optionally provide a reason for declining:
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reason (optional)"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowRejectModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleReject}
                disabled={isRejecting}>
                {isRejecting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Decline</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={styles.declineButton}
          onPress={() => setShowRejectModal(true)}
          disabled={isAccepting}>
          <Icon name="close" size={20} color="#F44336" />
          <Text style={styles.declineButtonText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.acceptButton, isAccepting && styles.buttonDisabled]}
          onPress={handleAccept}
          disabled={isAccepting}>
          {isAccepting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Icon name="check" size={20} color="#FFFFFF" />
              <Text style={styles.acceptButtonText}>Accept Role</Text>
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
  header: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#212121',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginTop: 8,
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#757575',
    marginLeft: 12,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#212121',
  },
  balanceCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#757575',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  balanceHighlight: {
    color: '#1976D2',
  },
  balanceDivider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 8,
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
  responsibilitiesList: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
  },
  responsibilityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  responsibilityText: {
    fontSize: 14,
    color: '#424242',
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
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  declineButtonText: {
    color: '#F44336',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  buttonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  // Modal styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F44336',
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default HandoffRequestScreen;

