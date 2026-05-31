import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {showMessage} from 'react-native-flash-message';
import {useAppDispatch} from '../../store';
import {submitReport} from '../../store/slices/reportsSlice';
import {ReportReason, ReportContentType} from '../../types/schema';

interface ReportContentModalProps {
  visible: boolean;
  onClose: () => void;
  contentType: ReportContentType;
  contentId?: string;
  contentSnapshot?: string;
  reportedUserId: string;
  reportedUserName: string;
  groupId: string;
}

interface ReportReasonOption {
  value: ReportReason;
  label: string;
  description: string;
  icon: string;
}

const REPORT_REASONS: ReportReasonOption[] = [
  {
    value: 'harassment',
    label: 'Harassment or bullying',
    description: 'Threatening, intimidating, or targeting behavior',
    icon: 'account-alert',
  },
  {
    value: 'spam',
    label: 'Spam or promotional content',
    description: 'Unwanted commercial or repetitive messages',
    icon: 'email-alert',
  },
  {
    value: 'inappropriate',
    label: 'Inappropriate content',
    description: 'Content that violates community guidelines',
    icon: 'alert-circle',
  },
  {
    value: 'threatening',
    label: 'Threatening behavior',
    description: 'Threats of violence or harm',
    icon: 'shield-alert',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Something else not listed above',
    icon: 'dots-horizontal-circle',
  },
];

const ReportContentModal: React.FC<ReportContentModalProps> = ({
  visible,
  onClose,
  contentType,
  contentId,
  contentSnapshot,
  reportedUserId,
  reportedUserName,
  groupId,
}) => {
  const dispatch = useAppDispatch();
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(
    null,
  );
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setSelectedReason(null);
    setDescription('');
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedReason) {
      showMessage({
        message: 'Please select a reason',
        description: 'Choose the type of issue you are reporting',
        type: 'warning',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        submitReport({
          reportedUserId,
          reportedUserName,
          groupId,
          contentType,
          contentId,
          contentSnapshot,
          reason: selectedReason,
          description: description.trim() || undefined,
        }),
      ).unwrap();

      showMessage({
        message: 'Report submitted',
        description:
          'Thank you for helping keep our community safe. An admin will review your report.',
        type: 'success',
      });

      handleClose();
    } catch (error: any) {
      showMessage({
        message: 'Failed to submit report',
        description: error || 'Please try again later',
        type: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getContentTypeLabel = () => {
    switch (contentType) {
      case 'message':
        return 'message';
      case 'announcement':
        return 'announcement';
      case 'user':
        return 'user';
      default:
        return 'content';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeButton}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Icon name="close" size={24} color="#666" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Report {getContentTypeLabel()}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled">
          {/* Report target info */}
          <View style={styles.targetInfo}>
            <Icon name="account-circle" size={40} color="#666" />
            <View style={styles.targetDetails}>
              <Text style={styles.targetName}>{reportedUserName}</Text>
              {contentSnapshot && (
                <Text style={styles.contentPreview} numberOfLines={2}>
                  "{contentSnapshot}"
                </Text>
              )}
            </View>
          </View>

          {/* Reason selection */}
          <Text style={styles.sectionTitle}>What's the issue?</Text>
          <View style={styles.reasonsList}>
            {REPORT_REASONS.map(reason => (
              <TouchableOpacity
                key={reason.value}
                style={[
                  styles.reasonOption,
                  selectedReason === reason.value &&
                    styles.reasonOptionSelected,
                ]}
                onPress={() => setSelectedReason(reason.value)}
                activeOpacity={0.7}>
                <View style={styles.reasonIconContainer}>
                  <Icon
                    name={reason.icon}
                    size={24}
                    color={selectedReason === reason.value ? '#007AFF' : '#666'}
                  />
                </View>
                <View style={styles.reasonTextContainer}>
                  <Text
                    style={[
                      styles.reasonLabel,
                      selectedReason === reason.value &&
                        styles.reasonLabelSelected,
                    ]}>
                    {reason.label}
                  </Text>
                  <Text style={styles.reasonDescription}>
                    {reason.description}
                  </Text>
                </View>
                <View style={styles.radioContainer}>
                  <View
                    style={[
                      styles.radio,
                      selectedReason === reason.value && styles.radioSelected,
                    ]}>
                    {selectedReason === reason.value && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Additional details */}
          <Text style={styles.sectionTitle}>Additional details (optional)</Text>
          <TextInput
            style={styles.descriptionInput}
            placeholder="Provide any additional context that might help us understand the issue..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            maxLength={500}
          />
          <Text style={styles.characterCount}>{description.length}/500</Text>

          {/* Privacy notice */}
          <View style={styles.privacyNotice}>
            <Icon name="shield-check" size={20} color="#666" />
            <Text style={styles.privacyText}>
              Your report will be reviewed by group admins. Your identity will
              be kept confidential from the reported user.
            </Text>
          </View>
        </ScrollView>

        {/* Footer with submit button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              (!selectedReason || isSubmitting) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!selectedReason || isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Icon name="flag" size={20} color="#fff" />
                <Text style={styles.submitButtonText}>Submit Report</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 24,
  },
  targetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    padding: 12,
    borderRadius: 12,
    marginBottom: 24,
  },
  targetDetails: {
    flex: 1,
    marginLeft: 12,
  },
  targetName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  contentPreview: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  reasonsList: {
    marginBottom: 24,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    marginBottom: 8,
  },
  reasonOptionSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F7FF',
  },
  reasonIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  reasonLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
  },
  reasonLabelSelected: {
    color: '#007AFF',
  },
  reasonDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  radioContainer: {
    marginLeft: 8,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#007AFF',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#000',
    minHeight: 100,
    backgroundColor: '#FAFAFA',
  },
  characterCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 16,
  },
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8F8F8',
    padding: 12,
    borderRadius: 12,
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
    lineHeight: 18,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#FFAAAA',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default ReportContentModal;
