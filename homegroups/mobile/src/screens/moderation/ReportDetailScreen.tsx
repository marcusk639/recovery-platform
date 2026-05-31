import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format, formatDistanceToNow} from 'date-fns';
import {showMessage} from 'react-native-flash-message';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchReportById,
  reviewReport,
  banUser,
  selectReportById,
  selectReportsStatus,
} from '../../store/slices/reportsSlice';
import {ReportStatus, ReportAction} from '../../types/schema';

type ReportDetailScreenRouteProp = RouteProp<
  GroupStackParamList,
  'ReportDetail'
>;
type ReportDetailScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'ReportDetail'
>;

const BAN_DURATION_OPTIONS = [
  {label: '24 hours', days: 1},
  {label: '7 days', days: 7},
  {label: '30 days', days: 30},
  {label: 'Permanent', days: undefined},
];

const getReasonLabel = (reason: string): string => {
  const labels: Record<string, string> = {
    harassment: 'Harassment or bullying',
    spam: 'Spam or promotional content',
    inappropriate: 'Inappropriate content',
    threatening: 'Threatening behavior',
    other: 'Other',
  };
  return labels[reason] || reason;
};

const getContentTypeLabel = (contentType: string): string => {
  switch (contentType) {
    case 'message':
      return 'Chat Message';
    case 'announcement':
      return 'Announcement';
    case 'user':
      return 'User Profile';
    default:
      return 'Content';
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

const ReportDetailScreen: React.FC = () => {
  const route = useRoute<ReportDetailScreenRouteProp>();
  const navigation = useNavigation<ReportDetailScreenNavigationProp>();
  const {reportId, groupId, groupName} = route.params;
  const dispatch = useAppDispatch();

  const report = useAppSelector(state => selectReportById(state, reportId));
  const status = useAppSelector(selectReportsStatus);

  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [banModalVisible, setBanModalVisible] = useState(false);
  const [selectedBanDuration, setSelectedBanDuration] = useState<
    number | undefined
  >(7);

  useEffect(() => {
    if (!report) {
      dispatch(fetchReportById(reportId));
    }
  }, [dispatch, reportId, report]);

  useEffect(() => {
    if (report?.adminNotes) {
      setAdminNotes(report.adminNotes);
    }
  }, [report]);

  const handleDismiss = async () => {
    Alert.alert(
      'Dismiss Report',
      'Are you sure you want to dismiss this report? This action indicates no violation was found.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Dismiss',
          onPress: async () => {
            await handleAction('dismissed', 'none');
          },
        },
      ],
    );
  };

  const handleWarn = async () => {
    Alert.alert(
      'Warn User',
      `Send a warning to ${report?.reportedUserName}? They will be notified that their behavior has been flagged.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Send Warning',
          onPress: async () => {
            await handleAction('actioned', 'warning');
          },
        },
      ],
    );
  };

  const handleRemoveContent = async () => {
    if (report?.contentType === 'user') {
      showMessage({
        message: 'Cannot remove user profile',
        description: 'Use "Ban User" to remove a user from the group',
        type: 'warning',
      });
      return;
    }

    Alert.alert(
      'Remove Content',
      `Remove the reported ${report?.contentType}? This cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await handleAction('actioned', 'content_removed');
          },
        },
      ],
    );
  };

  const handleBanUser = async () => {
    if (!report) return;

    setProcessing(true);
    try {
      await dispatch(
        banUser({
          userId: report.reportedUserId,
          userName: report.reportedUserName,
          groupId,
          reason: `Reported for: ${getReasonLabel(report.reason)}`,
          reportId: report.id,
          durationDays: selectedBanDuration,
        }),
      ).unwrap();

      await dispatch(
        reviewReport({
          reportId: report.id,
          status: 'actioned',
          action: 'user_banned',
          adminNotes: adminNotes.trim() || undefined,
        }),
      ).unwrap();

      showMessage({
        message: 'User banned',
        description: `${report.reportedUserName} has been banned from the group`,
        type: 'success',
      });

      setBanModalVisible(false);
      navigation.goBack();
    } catch (error: any) {
      showMessage({
        message: 'Failed to ban user',
        description: error || 'Please try again',
        type: 'danger',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleAction = async (
    newStatus: ReportStatus,
    action: ReportAction,
  ) => {
    if (!report) return;

    setProcessing(true);
    try {
      await dispatch(
        reviewReport({
          reportId: report.id,
          status: newStatus,
          action,
          adminNotes: adminNotes.trim() || undefined,
        }),
      ).unwrap();

      showMessage({
        message: 'Report updated',
        description: `Report has been marked as ${newStatus}`,
        type: 'success',
      });

      navigation.goBack();
    } catch (error: any) {
      showMessage({
        message: 'Failed to update report',
        description: error || 'Please try again',
        type: 'danger',
      });
    } finally {
      setProcessing(false);
    }
  };

  if (status === 'loading' && !report) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading report...</Text>
      </SafeAreaView>
    );
  }

  if (!report) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Icon name="alert-circle" size={48} color="#F44336" />
        <Text style={styles.errorText}>Report not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isPending = report.status === 'pending';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Status Banner */}
        <View
          style={[
            styles.statusBanner,
            {backgroundColor: getStatusColor(report.status) + '15'},
          ]}>
          <Icon
            name={
              report.status === 'pending'
                ? 'clock-outline'
                : report.status === 'actioned'
                ? 'check-circle'
                : report.status === 'dismissed'
                ? 'close-circle'
                : 'eye'
            }
            size={24}
            color={getStatusColor(report.status)}
          />
          <Text
            style={[styles.statusText, {color: getStatusColor(report.status)}]}>
            {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
          </Text>
          {report.action && (
            <Text style={styles.actionText}>
              Action: {report.action.replace('_', ' ')}
            </Text>
          )}
        </View>

        {/* Report Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Report Details</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type</Text>
            <Text style={styles.detailValue}>
              {getContentTypeLabel(report.contentType)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reason</Text>
            <View style={styles.reasonBadge}>
              <Icon name="alert-circle" size={16} color="#FF9800" />
              <Text style={styles.reasonText}>
                {getReasonLabel(report.reason)}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reported</Text>
            <Text style={styles.detailValue}>
              {format(report.createdAt, 'MMM d, yyyy h:mm a')}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Time ago</Text>
            <Text style={styles.detailValue}>
              {formatDistanceToNow(report.createdAt, {addSuffix: true})}
            </Text>
          </View>
        </View>

        {/* Reported User */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reported User</Text>
          <View style={styles.userCard}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {report.reportedUserName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{report.reportedUserName}</Text>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('GroupMemberDetails', {
                    groupId,
                    memberId: report.reportedUserId,
                  })
                }>
                <Text style={styles.viewProfileLink}>View Profile →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Reporter */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reported By</Text>
          <View style={styles.userCard}>
            <View style={[styles.userAvatar, {backgroundColor: '#4CAF50'}]}>
              <Text style={styles.userAvatarText}>
                {report.reporterName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{report.reporterName}</Text>
            </View>
          </View>
        </View>

        {/* Content Snapshot */}
        {report.contentSnapshot && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reported Content</Text>
            <View style={styles.contentSnapshot}>
              <Text style={styles.contentSnapshotText}>
                "{report.contentSnapshot}"
              </Text>
            </View>
          </View>
        )}

        {/* Reporter's Description */}
        {report.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reporter's Notes</Text>
            <Text style={styles.descriptionText}>{report.description}</Text>
          </View>
        )}

        {/* Review Info (if already reviewed) */}
        {report.reviewedBy && report.reviewedAt && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Review Information</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reviewed by</Text>
              <Text style={styles.detailValue}>
                {report.reviewedByName || 'Admin'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reviewed at</Text>
              <Text style={styles.detailValue}>
                {format(report.reviewedAt, 'MMM d, yyyy h:mm a')}
              </Text>
            </View>
            {report.adminNotes && (
              <View style={styles.adminNotesDisplay}>
                <Text style={styles.adminNotesLabel}>Admin Notes:</Text>
                <Text style={styles.adminNotesText}>{report.adminNotes}</Text>
              </View>
            )}
          </View>
        )}

        {/* Admin Notes Input (for pending reports) */}
        {isPending && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Admin Notes</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Add notes about your decision (optional)..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
              value={adminNotes}
              onChangeText={setAdminNotes}
              textAlignVertical="top"
            />
          </View>
        )}

        {/* Spacer for action buttons */}
        <View style={{height: 100}} />
      </ScrollView>

      {/* Action Buttons (for pending reports) */}
      {isPending && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.dismissButton]}
            onPress={handleDismiss}
            disabled={processing}>
            <Icon name="close" size={20} color="#757575" />
            <Text style={styles.dismissButtonText}>Dismiss</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.warnButton]}
            onPress={handleWarn}
            disabled={processing}>
            <Icon name="alert" size={20} color="#FF9800" />
            <Text style={styles.warnButtonText}>Warn</Text>
          </TouchableOpacity>

          {report.contentType !== 'user' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.removeButton]}
              onPress={handleRemoveContent}
              disabled={processing}>
              <Icon name="delete" size={20} color="#F44336" />
              <Text style={styles.removeButtonText}>Remove</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionButton, styles.banButton]}
            onPress={() => setBanModalVisible(true)}
            disabled={processing}>
            <Icon name="account-cancel" size={20} color="#fff" />
            <Text style={styles.banButtonText}>Ban</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Processing Overlay */}
      {processing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>Processing...</Text>
        </View>
      )}

      {/* Ban Modal */}
      <Modal
        visible={banModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setBanModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ban User</Text>
            <Text style={styles.modalSubtitle}>
              How long should {report?.reportedUserName} be banned?
            </Text>

            <View style={styles.banDurationOptions}>
              {BAN_DURATION_OPTIONS.map(option => (
                <TouchableOpacity
                  key={option.label}
                  style={[
                    styles.banDurationOption,
                    selectedBanDuration === option.days &&
                      styles.banDurationOptionSelected,
                  ]}
                  onPress={() => setSelectedBanDuration(option.days)}>
                  <Text
                    style={[
                      styles.banDurationOptionText,
                      selectedBanDuration === option.days &&
                        styles.banDurationOptionTextSelected,
                    ]}>
                    {option.label}
                  </Text>
                  {selectedBanDuration === option.days && (
                    <Icon name="check" size={20} color="#F44336" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setBanModalVisible(false)}>
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleBanUser}
                disabled={processing}>
                {processing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>Ban User</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    color: '#757575',
    marginTop: 12,
    marginBottom: 24,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#2196F3',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionText: {
    fontSize: 14,
    color: '#757575',
    marginLeft: 'auto',
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  detailLabel: {
    fontSize: 15,
    color: '#757575',
  },
  detailValue: {
    fontSize: 15,
    color: '#212121',
    fontWeight: '500',
  },
  reasonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reasonText: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '500',
    marginLeft: 4,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F44336',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  userInfo: {
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  viewProfileLink: {
    fontSize: 14,
    color: '#2196F3',
    marginTop: 4,
  },
  contentSnapshot: {
    backgroundColor: '#F8F8F8',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  contentSnapshotText: {
    fontSize: 15,
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 22,
  },
  descriptionText: {
    fontSize: 15,
    color: '#212121',
    lineHeight: 22,
  },
  adminNotesDisplay: {
    marginTop: 12,
    backgroundColor: '#F8F8F8',
    padding: 12,
    borderRadius: 8,
  },
  adminNotesLabel: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 4,
  },
  adminNotesText: {
    fontSize: 14,
    color: '#212121',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#212121',
    minHeight: 80,
    backgroundColor: '#FAFAFA',
  },
  actionsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 4,
    minHeight: 44,
  },
  dismissButton: {
    backgroundColor: '#F5F5F5',
  },
  dismissButtonText: {
    color: '#757575',
    fontWeight: '600',
    fontSize: 13,
  },
  warnButton: {
    backgroundColor: '#FFF3E0',
  },
  warnButtonText: {
    color: '#FF9800',
    fontWeight: '600',
    fontSize: 13,
  },
  removeButton: {
    backgroundColor: '#FFEBEE',
  },
  removeButtonText: {
    color: '#F44336',
    fontWeight: '600',
    fontSize: 13,
  },
  banButton: {
    backgroundColor: '#F44336',
  },
  banButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#757575',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  banDurationOptions: {
    gap: 8,
    marginBottom: 24,
  },
  banDurationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  banDurationOptionSelected: {
    borderColor: '#F44336',
    backgroundColor: '#FFEBEE',
  },
  banDurationOptionText: {
    fontSize: 16,
    color: '#212121',
  },
  banDurationOptionTextSelected: {
    color: '#F44336',
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 16,
    color: '#757575',
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F44336',
    alignItems: 'center',
  },
  modalConfirmButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});

export default ReportDetailScreen;
