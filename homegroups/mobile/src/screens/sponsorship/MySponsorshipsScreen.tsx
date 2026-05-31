import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  selectAllSponsorships,
  updateSponsorshipStatus,
  acceptSponsorshipRequest,
  rejectSponsorshipRequest,
} from '../../store/slices/sponsorshipSlice';
import {selectUserData} from '../../store/slices/authSlice';
import UserImage from '../../components/UserImage';
import {
  ProfileStackParamList,
  GroupStackParamList,
} from '../../types/navigation';

type MySponsorshipsNavigationProp = StackNavigationProp<ProfileStackParamList>;

interface SponsorshipRequest {
  id: string;
  sponseeId: string;
  sponseeName: string;
  sponsorId: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  groupId: string;
  groupName?: string;
}

interface SponsorshipRelationship {
  id: string;
  groupId: string;
  groupName?: string;
  sponsorId: string;
  sponsorName: string;
  sponsorPhotoURL?: string;
  sponseeId: string;
  sponseeName: string;
  sponseePhotoURL?: string;
  status: 'active' | 'ended';
  startDate: Date;
}

const MySponsorshipsScreen: React.FC = () => {
  const navigation = useNavigation<MySponsorshipsNavigationProp>();
  const dispatch = useAppDispatch();
  const currentUser = auth().currentUser;
  const userData = useAppSelector(selectUserData);

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeAsSponsor, setActiveAsSponsor] = useState<
    SponsorshipRelationship[]
  >([]);
  const [activeAsSponsee, setActiveAsSponsee] = useState<
    SponsorshipRelationship[]
  >([]);
  const [pendingRequestsToMe, setPendingRequestsToMe] = useState<
    SponsorshipRequest[]
  >([]);
  const [pendingRequestsFromMe, setPendingRequestsFromMe] = useState<
    SponsorshipRequest[]
  >([]);
  const [processingRequest, setProcessingRequest] = useState<string | null>(
    null,
  );

  const loadSponsorshipData = useCallback(async () => {
    if (!currentUser) return;

    try {
      // Fetch active sponsorships where I'm the sponsor
      const sponsorSnapshot = await firestore()
        .collection('sponsorships')
        .where('sponsorId', '==', currentUser.uid)
        .where('status', '==', 'active')
        .get();

      const sponsorRelationships: SponsorshipRelationship[] =
        sponsorSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            groupId: data.groupId,
            sponsorId: data.sponsorId,
            sponsorName: data.sponsorName || 'You',
            sponseeId: data.sponseeId,
            sponseeName: data.sponseeName || 'Unknown',
            sponseePhotoURL: data.sponseePhotoURL,
            status: 'active',
            startDate: data.startDate?.toDate() || new Date(),
          };
        });

      // Fetch active sponsorships where I'm the sponsee
      const sponseeSnapshot = await firestore()
        .collection('sponsorships')
        .where('sponseeId', '==', currentUser.uid)
        .where('status', '==', 'active')
        .get();

      const sponseeRelationships: SponsorshipRelationship[] =
        sponseeSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            groupId: data.groupId,
            sponsorId: data.sponsorId,
            sponsorName: data.sponsorName || 'Unknown',
            sponsorPhotoURL: data.sponsorPhotoURL,
            sponseeId: data.sponseeId,
            sponseeName: data.sponseeName || 'You',
            status: 'active',
            startDate: data.startDate?.toDate() || new Date(),
          };
        });

      // Fetch pending requests sent to me (I'm a potential sponsor)
      const requestsToMeSnapshot = await firestore()
        .collectionGroup('sponsorshipRequests')
        .where('sponsorId', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .get();

      const requestsToMe: SponsorshipRequest[] = requestsToMeSnapshot.docs.map(
        doc => {
          const data = doc.data();
          // Extract groupId from the document path
          const pathParts = doc.ref.path.split('/');
          const groupIdIndex = pathParts.indexOf('groups') + 1;
          const groupId = pathParts[groupIdIndex];

          return {
            id: doc.id,
            sponseeId: data.sponseeId,
            sponseeName: data.sponseeName || 'Unknown',
            sponsorId: data.sponsorId || currentUser.uid,
            message: data.message || '',
            status: data.status,
            createdAt: data.createdAt?.toDate() || new Date(),
            groupId,
          };
        },
      );

      // Fetch pending requests I sent
      const requestsFromMeSnapshot = await firestore()
        .collectionGroup('sponsorshipRequests')
        .where('sponseeId', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .get();

      const requestsFromMe: SponsorshipRequest[] =
        requestsFromMeSnapshot.docs.map(doc => {
          const data = doc.data();
          const pathParts = doc.ref.path.split('/');
          const groupIdIndex = pathParts.indexOf('groups') + 1;
          const groupId = pathParts[groupIdIndex];

          return {
            id: doc.id,
            sponseeId: data.sponseeId,
            sponseeName: data.sponseeName || 'You',
            sponsorId: data.sponsorId,
            message: data.message || '',
            status: data.status,
            createdAt: data.createdAt?.toDate() || new Date(),
            groupId,
          };
        });

      setActiveAsSponsor(sponsorRelationships);
      setActiveAsSponsee(sponseeRelationships);
      setPendingRequestsToMe(requestsToMe);
      setPendingRequestsFromMe(requestsFromMe);
    } catch (error) {
      console.error('Error loading sponsorship data:', error);
      Alert.alert(
        'Error',
        'Failed to load sponsorship data. Please try again.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadSponsorshipData();
  }, [loadSponsorshipData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadSponsorshipData();
  }, [loadSponsorshipData]);

  const handleAcceptRequest = async (request: SponsorshipRequest) => {
    Alert.alert(
      'Accept Sponsorship Request',
      `Are you sure you want to become ${request.sponseeName}'s sponsor?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Accept',
          onPress: async () => {
            setProcessingRequest(request.id);
            try {
              await dispatch(
                acceptSponsorshipRequest({
                  groupId: request.groupId,
                  requestId: request.id,
                }),
              ).unwrap();
              Alert.alert(
                'Success',
                `You are now ${request.sponseeName}'s sponsor!`,
              );
              loadSponsorshipData();
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.message || 'Failed to accept request.',
              );
            } finally {
              setProcessingRequest(null);
            }
          },
        },
      ],
    );
  };

  const handleRejectRequest = async (request: SponsorshipRequest) => {
    Alert.alert(
      'Decline Sponsorship Request',
      `Are you sure you want to decline ${request.sponseeName}'s request?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setProcessingRequest(request.id);
            try {
              await dispatch(
                rejectSponsorshipRequest({
                  groupId: request.groupId,
                  requestId: request.id,
                }),
              ).unwrap();
              Alert.alert(
                'Request Declined',
                'The sponsorship request has been declined.',
              );
              loadSponsorshipData();
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.message || 'Failed to decline request.',
              );
            } finally {
              setProcessingRequest(null);
            }
          },
        },
      ],
    );
  };

  const handleEndSponsorship = async (
    sponsorship: SponsorshipRelationship,
    isAsSponsor: boolean,
  ) => {
    const otherPersonName = isAsSponsor
      ? sponsorship.sponseeName
      : sponsorship.sponsorName;
    const relationshipType = isAsSponsor ? 'sponsee' : 'sponsor';

    Alert.alert(
      'End Sponsorship',
      `Are you sure you want to end your sponsorship with ${otherPersonName}? This cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'End Sponsorship',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(
                updateSponsorshipStatus({
                  groupId: sponsorship.groupId,
                  sponsorshipId: sponsorship.id,
                  status: 'terminated',
                }),
              ).unwrap();
              Alert.alert(
                'Sponsorship Ended',
                `Your sponsorship with ${otherPersonName} has been ended.`,
              );
              loadSponsorshipData();
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.message || 'Failed to end sponsorship.',
              );
            }
          },
        },
      ],
    );
  };

  const navigateToSponsorChat = (sponsorship: SponsorshipRelationship) => {
    // Navigate to the group stack's sponsor chat
    navigation.getParent()?.navigate('Home', {
      screen: 'SponsorChat',
      params: {
        groupId: sponsorship.groupId,
        groupName: sponsorship.groupName || '',
        sponsorId: sponsorship.sponsorId,
        sponseeId: sponsorship.sponseeId,
        sponsorName: sponsorship.sponsorName,
        sponseeName: sponsorship.sponseeName,
      },
    });
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading sponsorships...</Text>
      </View>
    );
  }

  const hasNoContent =
    activeAsSponsor.length === 0 &&
    activeAsSponsee.length === 0 &&
    pendingRequestsToMe.length === 0 &&
    pendingRequestsFromMe.length === 0;

  return (
    <ScrollView
      style={styles.container}
      testID="my-sponsorships-list"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }>
      {hasNoContent ? (
        <View style={styles.emptyContainer} testID="my-sponsorships-empty">
          <Icon name="account-heart-outline" size={80} color="#BDBDBD" />
          <Text style={styles.emptyTitle}>No Sponsorships Yet</Text>
          <Text style={styles.emptyText}>
            You don't have any active sponsorships or pending requests.
          </Text>
          <Text style={styles.emptySubtext}>
            To find a sponsor, visit a group and check the Sponsors section.
            {'\n'}
            To become a sponsor, enable "Available to sponsor" in your Profile
            settings.
          </Text>
        </View>
      ) : (
        <>
          {/* Pending Requests TO Me (I'm the potential sponsor) */}
          {pendingRequestsToMe.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="account-clock" size={24} color="#FF9800" />
                <Text style={styles.sectionTitle}>Sponsorship Requests</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {pendingRequestsToMe.length}
                  </Text>
                </View>
              </View>

              {pendingRequestsToMe.map(request => (
                <View key={request.id} style={styles.requestCard}>
                  <View style={styles.requestHeader}>
                    <UserImage
                      displayName={request.sponseeName}
                      style={styles.requestAvatar}
                    />
                    <View style={styles.requestInfo}>
                      <Text style={styles.requestName}>
                        {request.sponseeName}
                      </Text>
                      <Text style={styles.requestDate}>
                        Requested {formatDate(request.createdAt)}
                      </Text>
                    </View>
                  </View>

                  {request.message && (
                    <View style={styles.messageContainer}>
                      <Text style={styles.messageLabel}>Message:</Text>
                      <Text style={styles.messageText}>{request.message}</Text>
                    </View>
                  )}

                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={styles.declineButton}
                      onPress={() => handleRejectRequest(request)}
                      disabled={processingRequest === request.id}>
                      <Text style={styles.declineButtonText}>Decline</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.acceptButton}
                      onPress={() => handleAcceptRequest(request)}
                      disabled={processingRequest === request.id}>
                      {processingRequest === request.id ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.acceptButtonText}>Accept</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Pending Requests FROM Me (I'm seeking a sponsor) */}
          {pendingRequestsFromMe.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="send-clock" size={24} color="#9E9E9E" />
                <Text style={styles.sectionTitle}>My Pending Requests</Text>
              </View>

              {pendingRequestsFromMe.map(request => (
                <View key={request.id} style={styles.pendingCard}>
                  <Icon name="clock-outline" size={20} color="#FF9800" />
                  <View style={styles.pendingInfo}>
                    <Text style={styles.pendingText}>
                      Waiting for response...
                    </Text>
                    <Text style={styles.pendingDate}>
                      Sent {formatDate(request.createdAt)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* My Sponsor (I'm the sponsee) */}
          {activeAsSponsee.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="account-supervisor" size={24} color="#4CAF50" />
                <Text style={styles.sectionTitle}>My Sponsor</Text>
              </View>

              {activeAsSponsee.map(sponsorship => (
                <View key={sponsorship.id} style={styles.sponsorshipCard}>
                  <View style={styles.sponsorshipHeader}>
                    <UserImage
                      photoUrl={sponsorship.sponsorPhotoURL}
                      displayName={sponsorship.sponsorName}
                      style={styles.sponsorshipAvatar}
                    />
                    <View style={styles.sponsorshipInfo}>
                      <Text style={styles.sponsorshipName}>
                        {sponsorship.sponsorName}
                      </Text>
                      <Text style={styles.sponsorshipDate}>
                        Since {formatDate(sponsorship.startDate)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.sponsorshipActions}>
                    <TouchableOpacity
                      style={styles.chatButton}
                      onPress={() => navigateToSponsorChat(sponsorship)}>
                      <Icon name="message-text" size={18} color="#2196F3" />
                      <Text style={styles.chatButtonText}>Message</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.endButton}
                      onPress={() => handleEndSponsorship(sponsorship, false)}>
                      <Icon name="account-remove" size={18} color="#F44336" />
                      <Text style={styles.endButtonText}>End</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* My Sponsees (I'm the sponsor) */}
          {activeAsSponsor.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="account-group" size={24} color="#2196F3" />
                <Text style={styles.sectionTitle}>
                  My Sponsees ({activeAsSponsor.length})
                </Text>
              </View>

              {activeAsSponsor.map(sponsorship => (
                <View key={sponsorship.id} style={styles.sponsorshipCard}>
                  <View style={styles.sponsorshipHeader}>
                    <UserImage
                      photoUrl={sponsorship.sponseePhotoURL}
                      displayName={sponsorship.sponseeName}
                      style={styles.sponsorshipAvatar}
                    />
                    <View style={styles.sponsorshipInfo}>
                      <Text style={styles.sponsorshipName}>
                        {sponsorship.sponseeName}
                      </Text>
                      <Text style={styles.sponsorshipDate}>
                        Since {formatDate(sponsorship.startDate)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.sponsorshipActions}>
                    <TouchableOpacity
                      style={styles.chatButton}
                      onPress={() => navigateToSponsorChat(sponsorship)}>
                      <Icon name="message-text" size={18} color="#2196F3" />
                      <Text style={styles.chatButtonText}>Message</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.endButton}
                      onPress={() => handleEndSponsorship(sponsorship, true)}>
                      <Icon name="account-remove" size={18} color="#F44336" />
                      <Text style={styles.endButtonText}>End</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* Sponsor Availability Status */}
      <View style={styles.availabilitySection}>
        <View style={styles.availabilityContent}>
          <Icon
            name={
              userData?.sponsorSettings?.isAvailable
                ? 'check-circle'
                : 'circle-outline'
            }
            size={20}
            color={
              userData?.sponsorSettings?.isAvailable ? '#4CAF50' : '#9E9E9E'
            }
          />
          <Text style={styles.availabilityText}>
            {userData?.sponsorSettings?.isAvailable
              ? 'You are available to sponsor others'
              : 'You are not currently available to sponsor'}
          </Text>
        </View>
        <Text style={styles.availabilityHint}>
          Change this in your Profile settings
        </Text>
      </View>
    </ScrollView>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#424242',
    marginTop: 20,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginLeft: 10,
    flex: 1,
  },
  badge: {
    backgroundColor: '#FF9800',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  requestCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  requestAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 2,
  },
  requestDate: {
    fontSize: 13,
    color: '#757575',
  },
  messageContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  messageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 20,
  },
  requestActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  declineButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  declineButtonText: {
    color: '#757575',
    fontWeight: '600',
    fontSize: 14,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 20,
    minWidth: 90,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  pendingInfo: {
    marginLeft: 12,
    flex: 1,
  },
  pendingText: {
    fontSize: 14,
    color: '#757575',
    fontStyle: 'italic',
  },
  pendingDate: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 2,
  },
  sponsorshipCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  sponsorshipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sponsorshipAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  sponsorshipInfo: {
    flex: 1,
  },
  sponsorshipName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 2,
  },
  sponsorshipDate: {
    fontSize: 13,
    color: '#757575',
  },
  sponsorshipActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  chatButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 6,
  },
  endButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  endButtonText: {
    color: '#F44336',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 6,
  },
  availabilitySection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 32,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  availabilityContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  availabilityText: {
    fontSize: 14,
    color: '#424242',
    marginLeft: 10,
    flex: 1,
  },
  availabilityHint: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 8,
    marginLeft: 30,
  },
});

export default MySponsorshipsScreen;
