import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {GroupModel} from '../../models/GroupModel';
import {HomeGroup, AdminActivityStatus, AdminRequestEscalationLevel} from '../../types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  getMostActiveAdminStatus,
  formatInactivityDisplay,
} from '../../services/activityTracker';
import ActivityStatusBadge from '../common/ActivityStatusBadge';

interface AdminRequestCardProps {
  group: HomeGroup;
  onRequestSubmitted?: () => void;
}

const AdminRequestCard: React.FC<AdminRequestCardProps> = ({
  group,
  onRequestSubmitted,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminActivityStatus, setAdminActivityStatus] =
    useState<AdminActivityStatus>('active');
  const [inactivityDays, setInactivityDays] = useState<number>(0);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);

  // Fetch admin activity status
  useEffect(() => {
    const fetchActivityStatus = async () => {
      if (!group.id || !group.admins?.length) {
        setAdminActivityStatus('dormant');
        setInactivityDays(Infinity);
        setIsLoadingActivity(false);
        return;
      }

      try {
        const status = await getMostActiveAdminStatus(group.id);
        setAdminActivityStatus(status.allAdminsStatus);
        setInactivityDays(status.inactivityDays);
      } catch (error) {
        console.error('Error fetching admin activity:', error);
      } finally {
        setIsLoadingActivity(false);
      }
    };

    fetchActivityStatus();
  }, [group.id, group.admins]);

  // Check if user has already submitted a request
  const hasSubmittedRequest = () => {
    if (!group.pendingAdminRequests) return false;

    // Check if current user's ID is in the pending requests
    const currentUserId = GroupModel.getCurrentUserId();
    return group.pendingAdminRequests.some(
      request => request.uid === currentUserId,
    );
  };

  const handleRequestAdmin = async () => {
    try {
      setIsSubmitting(true);
      const result = await GroupModel.requestAdminAccess(group.id, message);

      // Show different messages based on escalation level
      if (result.escalationLevel === 'instant') {
        Alert.alert(
          'Admin Access Granted!',
          'You are now an admin of this group. The previous admins were inactive, so you have been granted immediate access.',
        );
      } else if (result.escalationLevel === 'timed') {
        const autoApproveDate = result.autoApproveAt
          ? result.autoApproveAt.toLocaleDateString()
          : '7 days';
        Alert.alert(
          'Request Submitted',
          `Your request has been submitted. Since the current admins appear inactive, your request will be automatically approved on ${autoApproveDate} if no response is received.`,
        );
      } else {
        Alert.alert(
          'Request Submitted',
          'Your request to become an admin for this group has been submitted for review.',
        );
      }

      setIsExpanded(false);
      setMessage('');
      if (onRequestSubmitted) {
        onRequestSubmitted();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to submit admin request');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if user is already an admin
  const isAlreadyAdmin = () => {
    const currentUserId = GroupModel.getCurrentUserId();
    return currentUserId && group.admins?.includes(currentUserId);
  };

  // If user is already an admin, don't show the card
  if (isAlreadyAdmin()) {
    return null;
  }

  // If user has already submitted a request, show pending status
  if (hasSubmittedRequest()) {
    return (
      <View style={styles.container}>
        <View style={styles.pendingContainer}>
          <Icon name="clock-outline" size={24} color="#FFA000" />
          <Text style={styles.pendingText}>
            Your admin request for this group is pending review.
          </Text>
        </View>
      </View>
    );
  }

  // Get the appropriate title, description, and button text based on status
  const getCardContent = () => {
    if (!group.isClaimed || !group.admins?.length) {
      return {
        title: 'This group needs an admin',
        description:
          'Are you a leader or regular attendee of this group? Help keep the information up to date by becoming an admin.',
        buttonText: 'Claim This Group',
        borderColor: '#4CAF50',
        iconColor: '#4CAF50',
      };
    }

    if (adminActivityStatus === 'dormant') {
      return {
        title: 'Claim This Group',
        description:
          'The current admins have been inactive for over 60 days. You can claim admin access immediately.',
        buttonText: 'Claim Admin Access',
        borderColor: '#F44336',
        iconColor: '#F44336',
      };
    }

    if (adminActivityStatus === 'inactive') {
      return {
        title: 'Request Admin Access',
        description:
          'The current admins have been inactive for 30+ days. Your request will auto-approve in 7 days if no response.',
        buttonText: 'Request Admin Access',
        borderColor: '#FF9800',
        iconColor: '#FF9800',
      };
    }

    return {
      title: 'Request Admin Access',
      description:
        'Are you a leader or officer of this group? Request admin access to help manage group information.',
      buttonText: 'Request Admin Access',
      borderColor: '#1976D2',
      iconColor: '#1976D2',
    };
  };

  const cardContent = getCardContent();

  return (
    <View style={[styles.container, {borderLeftColor: cardContent.borderColor}]}>
      <View style={styles.cardContent}>
        <View style={styles.iconContainer}>
          <Icon name="account-key" size={28} color={cardContent.iconColor} />
        </View>
        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, {color: cardContent.iconColor}]}>
              {cardContent.title}
            </Text>
            {!isLoadingActivity && group.isClaimed && group.admins?.length > 0 && (
              <ActivityStatusBadge
                status={adminActivityStatus}
                size="small"
                showLabel={false}
              />
            )}
          </View>
          <Text style={styles.description}>{cardContent.description}</Text>
          {!isLoadingActivity &&
            adminActivityStatus !== 'active' &&
            group.admins?.length > 0 && (
              <Text style={styles.activityInfo}>
                <Icon name="information-outline" size={14} color="#757575" />{' '}
                Admin {formatInactivityDisplay(inactivityDays).toLowerCase()}
              </Text>
            )}
        </View>
      </View>

      {isExpanded ? (
        <View style={styles.expandedContent}>
          <Text style={styles.label}>
            Tell us your connection to this group:
          </Text>
          <TextInput
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            placeholder="e.g., I'm the group secretary, I attend every week, etc."
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setIsExpanded(false);
                setMessage('');
              }}
              disabled={isSubmitting}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleRequestAdmin}
              disabled={isSubmitting}>
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Request</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.requestButton,
            {backgroundColor: cardContent.borderColor},
          ]}
          onPress={() => setIsExpanded(true)}>
          <Text style={styles.requestButtonText}>{cardContent.buttonText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#1976D2',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    marginRight: 16,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976D2',
    flex: 1,
  },
  activityInfo: {
    fontSize: 12,
    color: '#757575',
    marginTop: 6,
    fontStyle: 'italic',
  },
  description: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 20,
  },
  requestButton: {
    backgroundColor: '#1976D2',
    borderRadius: 4,
    padding: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  requestButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  expandedContent: {
    marginTop: 16,
  },
  label: {
    fontSize: 14,
    color: '#424242',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 4,
    padding: 10,
    backgroundColor: '#F5F5F5',
    fontSize: 14,
    color: '#212121',
    minHeight: 80,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#BDBDBD',
  },
  cancelButtonText: {
    color: '#757575',
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#1976D2',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  pendingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    padding: 12,
    borderRadius: 4,
  },
  pendingText: {
    marginLeft: 8,
    color: '#5D4037',
    fontSize: 14,
    flex: 1,
  },
});

export default AdminRequestCard;
