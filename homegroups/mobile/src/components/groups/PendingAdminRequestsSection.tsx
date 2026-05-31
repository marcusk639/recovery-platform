import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import firestore from '@react-native-firebase/firestore';
import {GroupModel} from '../../models/GroupModel';
import {HomeGroup, AdminRequestEscalationLevel} from '../../types';

interface AdminRequest {
  uid: string;
  message?: string;
  requestedAt: Date;
  displayName?: string;
  escalationLevel?: AdminRequestEscalationLevel;
  autoApproveAt?: Date;
  notificationsSent?: number;
}

interface PendingAdminRequestsSectionProps {
  group: HomeGroup;
  onRequestHandled?: () => void;
}

const PendingAdminRequestsSection: React.FC<
  PendingAdminRequestsSectionProps
> = ({group, onRequestHandled}) => {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingUid, setProcessingUid] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, [group.pendingAdminRequests]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const pendingRequests = group.pendingAdminRequests || [];

      if (pendingRequests.length === 0) {
        setRequests([]);
        setLoading(false);
        return;
      }

      // Fetch user info for each request
      const requestsWithNames = await Promise.all(
        pendingRequests.map(async (req: any) => {
          try {
            const userDoc = await firestore()
              .collection('users')
              .doc(req.uid)
              .get();
            const userData = userDoc.data();
            return {
              uid: req.uid,
              message: req.message,
              requestedAt:
                req.requestedAt instanceof Date
                  ? req.requestedAt
                  : req.requestedAt?.toDate?.() || new Date(),
              displayName:
                req.requesterName || userData?.displayName || 'Unknown User',
              escalationLevel: req.escalationLevel || 'normal',
              autoApproveAt:
                req.autoApproveAt instanceof Date
                  ? req.autoApproveAt
                  : req.autoApproveAt?.toDate?.() || undefined,
              notificationsSent: req.notificationsSent || 0,
            };
          } catch (error) {
            return {
              uid: req.uid,
              message: req.message,
              requestedAt:
                req.requestedAt instanceof Date
                  ? req.requestedAt
                  : req.requestedAt?.toDate?.() || new Date(),
              displayName: req.requesterName || 'Unknown User',
              escalationLevel: req.escalationLevel || 'normal',
              autoApproveAt:
                req.autoApproveAt instanceof Date
                  ? req.autoApproveAt
                  : req.autoApproveAt?.toDate?.() || undefined,
              notificationsSent: req.notificationsSent || 0,
            };
          }
        }),
      );

      setRequests(requestsWithNames);
    } catch (error) {
      console.error('Error loading admin requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: AdminRequest) => {
    Alert.alert(
      'Approve Admin Request',
      `Are you sure you want to make ${request.displayName} an admin of this group?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              setProcessingUid(request.uid);
              await GroupModel.approveAdminRequest(group.id, request.uid);
              Alert.alert(
                'Success',
                `${request.displayName} is now an admin of this group.`,
              );
              onRequestHandled?.();
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.message || 'Failed to approve request',
              );
            } finally {
              setProcessingUid(null);
            }
          },
        },
      ],
    );
  };

  const handleDeny = async (request: AdminRequest) => {
    Alert.alert(
      'Deny Admin Request',
      `Are you sure you want to deny ${request.displayName}'s request?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Deny',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingUid(request.uid);
              await GroupModel.denyAdminRequest(group.id, request.uid);
              Alert.alert('Request Denied', 'The admin request has been denied.');
              onRequestHandled?.();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to deny request');
            } finally {
              setProcessingUid(null);
            }
          },
        },
      ],
    );
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return 'Today';
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getAutoApproveCountdown = (autoApproveAt: Date | undefined) => {
    if (!autoApproveAt) return null;

    const now = new Date();
    const diff = autoApproveAt.getTime() - now.getTime();

    if (diff <= 0) {
      return 'Auto-approving soon...';
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );

    if (days > 0) {
      return `Auto-approves in ${days}d ${hours}h`;
    } else if (hours > 0) {
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return `Auto-approves in ${hours}h ${minutes}m`;
    } else {
      const minutes = Math.floor(diff / (1000 * 60));
      return `Auto-approves in ${minutes}m`;
    }
  };

  const getEscalationBadge = (request: AdminRequest) => {
    if (request.escalationLevel === 'timed') {
      return {
        text: 'TIMED',
        color: '#FF9800',
        icon: 'timer-sand',
      };
    }
    return null;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#2196F3" />
      </View>
    );
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Icon name="account-clock" size={20} color="#FF9800" />
        <Text style={styles.headerText}>
          Pending Admin Requests ({requests.length})
        </Text>
      </View>

      {requests.map(request => {
        const escalationBadge = getEscalationBadge(request);
        const countdown =
          request.escalationLevel === 'timed'
            ? getAutoApproveCountdown(request.autoApproveAt)
            : null;

        return (
          <View
            key={request.uid}
            style={[
              styles.requestCard,
              request.escalationLevel === 'timed' && styles.timedRequestCard,
            ]}>
            <View style={styles.requestInfo}>
              <View style={styles.userRow}>
                <Icon name="account" size={20} color="#757575" />
                <Text style={styles.userName}>{request.displayName}</Text>
                {escalationBadge && (
                  <View
                    style={[
                      styles.escalationBadge,
                      {backgroundColor: escalationBadge.color},
                    ]}>
                    <Icon
                      name={escalationBadge.icon}
                      size={10}
                      color="#FFFFFF"
                    />
                    <Text style={styles.escalationBadgeText}>
                      {escalationBadge.text}
                    </Text>
                  </View>
                )}
              </View>
              {request.message && (
                <Text style={styles.message} numberOfLines={2}>
                  "{request.message}"
                </Text>
              )}
              <Text style={styles.date}>
                Requested {formatDate(request.requestedAt)}
              </Text>
              {countdown && (
                <View style={styles.countdownContainer}>
                  <Icon name="clock-alert-outline" size={14} color="#FF9800" />
                  <Text style={styles.countdownText}>{countdown}</Text>
                </View>
              )}
            </View>

            <View style={styles.actionButtons}>
              {processingUid === request.uid ? (
                <ActivityIndicator size="small" color="#2196F3" />
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.denyButton}
                    onPress={() => handleDeny(request)}>
                    <Icon name="close" size={18} color="#F44336" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() => handleApprove(request)}>
                    <Icon name="check" size={18} color="#4CAF50" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E65100',
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  timedRequestCard: {
    borderWidth: 1,
    borderColor: '#FF9800',
    backgroundColor: '#FFFDE7',
  },
  requestInfo: {
    flex: 1,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
  },
  message: {
    fontSize: 13,
    color: '#616161',
    fontStyle: 'italic',
    marginTop: 4,
    marginLeft: 26,
  },
  date: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 4,
    marginLeft: 26,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 12,
  },
  approveButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  denyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F44336',
  },
  escalationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
    gap: 3,
  },
  escalationBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginLeft: 26,
    gap: 4,
  },
  countdownText: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '600',
  },
});

export default PendingAdminRequestsSection;

