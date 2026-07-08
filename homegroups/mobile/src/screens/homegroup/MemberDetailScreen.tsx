import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RouteProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList} from '../../types/navigation';
import {differenceInDays, format, parseISO} from 'date-fns';
import auth from '@react-native-firebase/auth';
import {GroupModel} from '../../models/GroupModel';
import {GroupMember} from '../../types';
import {Button} from '../../components/common/Button';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  selectMemberById,
  selectMembersStatus,
  selectMembersError,
  fetchGroupMembers,
} from '../../store/slices/membersSlice';
import {
  fetchServicePositionsForGroup,
  selectMemberServicePositionsForGroup,
} from '../../store/slices/servicePositionsSlice';
import {
  selectActiveSponsorship,
  selectAllSponsorships,
  selectSponsorSettings,
} from '../../store/slices/sponsorshipSlice';
import ReportContentModal from '../../components/moderation/ReportContentModal';
import {
  DirectMessageModel,
  generateThreadId,
} from '../../models/DirectMessageModel';

type MemberDetailScreenRouteProp = RouteProp<
  GroupStackParamList,
  'GroupMemberDetails'
>;

type MemberDetailScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'GroupMemberDetails'
>;

type Props = {
  route: MemberDetailScreenRouteProp;
  navigation: MemberDetailScreenNavigationProp;
};

const MemberDetailScreen: React.FC<Props> = ({route, navigation}) => {
  const {groupId, memberId} = route.params;
  const dispatch = useAppDispatch();

  // Redux state selectors
  const member = useAppSelector(state => selectMemberById(state, memberId));
  const membersStatus = useAppSelector(selectMembersStatus);
  const membersError = useAppSelector(selectMembersError);
  const loading = membersStatus === 'loading';
  const servicePositions = useAppSelector(state =>
    selectMemberServicePositionsForGroup(state, groupId, memberId),
  );

  // Add sponsorship selectors
  const allSponsorships = useAppSelector(selectAllSponsorships);
  const activeSponsorship = useAppSelector(state =>
    selectActiveSponsorship(state, groupId),
  );

  // Add sponsorship status checks
  const isSponsor = allSponsorships.some(
    sponsorship =>
      sponsorship.sponsorId === memberId && sponsorship.status === 'active',
  );

  const hasSponsor = allSponsorships.some(
    sponsorship =>
      sponsorship.sponseeId === memberId && sponsorship.status === 'active',
  );

  // Add sponsor settings selector
  const sponsorSettings = useAppSelector(state =>
    selectSponsorSettings(state, memberId),
  );

  const [isCurrentUserAdmin, setIsCurrentUserAdmin] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const currentUser = auth().currentUser;
  const isViewingOwnProfile = memberId === currentUser?.uid;

  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch members if we don't have the member in the store
        if (!member) {
          dispatch(fetchGroupMembers(groupId)).unwrap();
        }

        if (!servicePositions) {
          dispatch(fetchServicePositionsForGroup(groupId)).unwrap();
        }

        // Check if current user is admin of this group
        const currentUser = auth().currentUser;
        if (currentUser) {
          const isUserAdmin = await GroupModel.isGroupAdmin(
            groupId,
            currentUser.uid,
          );
          setIsCurrentUserAdmin(isUserAdmin);
        }
      } catch (error) {
        console.error('Error loading member details:', error);
      }
    };

    loadData();
  }, [groupId, memberId, dispatch]);

  // Show error from Redux
  useEffect(() => {
    if (membersError) {
      Alert.alert('Error', membersError);
    }
  }, [membersError]);

  const formatSobrietyDate = (dateString?: string) => {
    if (!dateString) return 'Not set';

    try {
      return format(parseISO(dateString), 'MMMM d, yyyy');
    } catch (e) {
      return dateString;
    }
  };

  const calculateSobrietyTime = (dateString?: string) => {
    if (!dateString) return '';

    try {
      const sobrietyDate = parseISO(dateString);
      const today = new Date();
      const days = differenceInDays(today, sobrietyDate);

      const years = Math.floor(days / 365);
      const months = Math.floor((days % 365) / 30);
      const remainingDays = days % 30;

      let sobrietyText = '';

      if (years > 0) {
        sobrietyText += `${years} ${years === 1 ? 'year' : 'years'}`;
      }

      if (months > 0) {
        sobrietyText += sobrietyText
          ? `, ${months} ${months === 1 ? 'month' : 'months'}`
          : `${months} ${months === 1 ? 'month' : 'months'}`;
      }

      if (remainingDays > 0 || (!years && !months)) {
        sobrietyText += sobrietyText
          ? `, ${remainingDays} ${remainingDays === 1 ? 'day' : 'days'}`
          : `${remainingDays} ${remainingDays === 1 ? 'day' : 'days'}`;
      }

      return sobrietyText;
    } catch (e) {
      return '';
    }
  };

  const formatPhoneNumber = (phone?: string): string => {
    // Basic US phone number formatting: (555) 555-5555
    if (!phone) return 'Not available';

    // Strip all non-digits
    const cleaned = phone.replace(/\D/g, '');

    // Check for US format (10 digits)
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(
        6,
      )}`;
    }

    // International number or other format
    return phone;
  };

  const handleCallMember = (phoneNumber?: string) => {
    if (!phoneNumber) return;

    // Use the tel: protocol to initiate a call
    const telUrl = `tel:${phoneNumber.replace(/\D/g, '')}`;

    Linking.canOpenURL(telUrl)
      .then(supported => {
        if (supported) {
          return Linking.openURL(telUrl);
        } else {
          Alert.alert('Error', 'Phone calls are not supported on this device');
        }
      })
      .catch(err => {
        console.error('Error initiating phone call:', err);
        Alert.alert('Error', 'Could not initiate phone call');
      });
  };

  const handleSendSMS = (phoneNumber?: string) => {
    if (!phoneNumber) return;

    // Use the sms: protocol to start a text message
    const smsUrl =
      Platform.OS === 'ios'
        ? `sms:${phoneNumber.replace(/\D/g, '')}`
        : `sms:${phoneNumber.replace(/\D/g, '')}?body=`;

    Linking.canOpenURL(smsUrl)
      .then(supported => {
        if (supported) {
          return Linking.openURL(smsUrl);
        } else {
          Alert.alert('Error', 'SMS is not supported on this device');
        }
      })
      .catch(err => {
        console.error('Error opening SMS app:', err);
        Alert.alert('Error', 'Could not open messaging app');
      });
  };

  const handleMakeAdmin = async () => {
    if (!member || !groupId || !memberId) return;

    try {
      setProcessingAction(true);
      await GroupModel.makeAdmin(groupId, memberId);
      Alert.alert('Success', `${member.name} is now an admin of this group`);
      // Refresh members to update the Redux store
      await dispatch(fetchGroupMembers(groupId)).unwrap();
    } catch (error) {
      console.error('Error making member admin:', error);
      Alert.alert('Error', 'Failed to make member an admin');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleRemoveAdmin = async () => {
    if (!member || !groupId || !memberId) return;

    try {
      setProcessingAction(true);
      await GroupModel.removeAdmin(groupId, memberId);
      Alert.alert(
        'Success',
        `${member.name} is no longer an admin of this group`,
      );
      // Refresh members to update the Redux store
      await dispatch(fetchGroupMembers(groupId)).unwrap();
    } catch (error) {
      console.error('Error removing admin status:', error);
      Alert.alert('Error', 'Failed to remove admin status');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleStartDirectMessage = async () => {
    if (!member || !currentUser) return;

    // Use member.userId (the actual Firebase UID) instead of memberId (the document ID)
    const targetUserId = member.userId;

    if (!targetUserId) {
      Alert.alert('Error', 'Unable to message this user.');
      return;
    }

    try {
      setProcessingAction(true);

      // Check if user can message this member
      const canMessage = await DirectMessageModel.checkCanMessage(
        currentUser.uid,
        targetUserId,
      );

      if (!canMessage.canMessage) {
        Alert.alert(
          'Cannot Message',
          canMessage.reason || 'Unable to message this user',
        );
        setProcessingAction(false);
        return;
      }

      // Generate thread ID using actual user IDs
      const threadId = generateThreadId(currentUser.uid, targetUserId);

      // Navigate to direct message screen
      navigation.navigate('DirectMessage', {
        threadId,
        otherUserId: targetUserId,
        otherUserName: member.name,
        otherUserPhotoURL: member.photoUrl || undefined,
      });
    } catch (error) {
      console.error('Error starting direct message:', error);
      Alert.alert('Error', 'Failed to start conversation. Please try again.');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!member || !groupId || !memberId) return;

    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${member.name} from this group?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingAction(true);
              await GroupModel.removeMember(groupId, memberId);
              Alert.alert(
                'Success',
                `${member.name} has been removed from the group`,
              );
              // Refresh members to update the Redux store
              await dispatch(fetchGroupMembers(groupId)).unwrap();
              navigation.goBack();
            } catch (error) {
              console.error('Error removing member:', error);
              Alert.alert('Error', 'Failed to remove member from the group');
              setProcessingAction(false);
            }
          },
        },
      ],
    );
  };

  if (loading || !member) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading member details...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="member-detail-screen">
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Member Details</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.profileSection}>
          <View style={styles.profileHeader}>
            <View style={styles.profileInitials}>
              <Text style={styles.initialsText}>
                {member.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{member.name}</Text>
              {member.position && (
                <Text style={styles.profilePosition}>{member.position}</Text>
              )}
              {member.isAdmin && (
                <View style={styles.adminBadge}>
                  <Icon name="crown" size={14} color="#FFA000" />
                  <Text style={styles.adminBadgeText}>Admin</Text>
                </View>
              )}
            </View>
          </View>

          {/* Sobriety Information */}
          {member.sobrietyDate && member.showSobrietyDate === true && (
            <View style={styles.infoSection}>
              <Text style={styles.infoLabel}>Sobriety Date</Text>
              <Text style={styles.infoValue}>
                {formatSobrietyDate(member.sobrietyDate)}
              </Text>
              <Text style={styles.sobrietyTime}>
                {calculateSobrietyTime(member.sobrietyDate)} of sobriety
              </Text>
            </View>
          )}

          {/* Phone Number Section - Only show if available and user has allowed sharing */}
          {member.phoneNumber && member.showPhoneNumber && (
            <View style={styles.infoSection}>
              <Text style={styles.infoLabel}>Phone Number</Text>
              <Text style={styles.infoValue}>
                {formatPhoneNumber(member.phoneNumber)}
              </Text>

              <View style={styles.phoneActionsContainer}>
                <TouchableOpacity
                  style={styles.phoneActionButton}
                  onPress={() => handleCallMember(member.phoneNumber)}>
                  <Icon name="phone" size={20} color="#4CAF50" />
                  <Text style={[styles.phoneActionText, {color: '#4CAF50'}]}>
                    Call
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.phoneActionButton}
                  onPress={() => handleSendSMS(member.phoneNumber)}>
                  <Icon name="message-text" size={20} color="#2196F3" />
                  <Text style={[styles.phoneActionText, {color: '#2196F3'}]}>
                    Text
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Joined Date */}
          <View style={styles.infoSection}>
            <Text style={styles.infoLabel}>Member Since</Text>
            <Text style={styles.infoValue}>
              {member.joinedAt
                ? format(member.joinedAt, 'MMMM d, yyyy')
                : 'Unknown'}
            </Text>
          </View>

          {/* Service Positions Section */}
          {servicePositions && servicePositions.length > 0 && (
            <View style={styles.infoSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.infoLabel}>Service Positions</Text>
                <View style={styles.servicePositionsIconContainer}>
                  <Icon name="badge-account" size={20} color="#2196F3" />
                </View>
              </View>
              <View style={styles.servicePositionsList}>
                {servicePositions.map(position => (
                  <View key={position.id} style={styles.servicePositionItem}>
                    <View style={styles.servicePositionHeader}>
                      <Text style={styles.servicePositionName}>
                        {position.name}
                      </Text>
                      {position.description && (
                        <Text style={styles.servicePositionDescription}>
                          {position.description}
                        </Text>
                      )}
                    </View>
                    {(position.termStartDate || position.termEndDate) && (
                      <View style={styles.servicePositionTerm}>
                        <Icon name="calendar" size={12} color="#757575" />
                        <Text style={styles.servicePositionTermText}>
                          {position.termStartDate
                            ? new Date(
                                position.termStartDate,
                              ).toLocaleDateString()
                            : 'Started'}
                          {position.termEndDate
                            ? ` - ${new Date(
                                position.termEndDate,
                              ).toLocaleDateString()}`
                            : position.commitmentLength
                            ? ` (${position.commitmentLength} months)`
                            : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Update Sponsorship Section */}
          <View style={styles.infoSection}>
            <Text style={styles.infoLabel}>Sponsorship Status</Text>

            {sponsorSettings?.isAvailable ? (
              <View style={styles.sponsorshipStatus}>
                <Icon
                  name="account-check"
                  size={20}
                  color="#4CAF50"
                  style={styles.sponsorshipIcon}
                />
                <View style={styles.sponsorshipInfo}>
                  <Text style={styles.sponsorshipText}>
                    Available to sponsor
                  </Text>
                  {sponsorSettings.bio && (
                    <Text style={styles.sponsorshipDetail}>
                      {sponsorSettings.bio}
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <Text style={styles.sponsorshipText}>
                Not available to sponsor
              </Text>
            )}
          </View>

          {/* Direct Message Button - Only show for other members */}
          {!isViewingOwnProfile && (
            <View style={styles.infoSection}>
              <Button
                title="Message"
                onPress={handleStartDirectMessage}
                loading={processingAction}
                disabled={processingAction}
                style={styles.actionButton}
              />
            </View>
          )}

          {/* Report User Button - Only show for other members */}
          {!isViewingOwnProfile && !isCurrentUserAdmin && (
            <View style={styles.reportSection}>
              <TouchableOpacity
                style={styles.reportButton}
                onPress={() => setReportModalVisible(true)}>
                <Icon name="flag" size={20} color="#FF9800" />
                <Text style={styles.reportButtonText}>Report User</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Admin Actions */}
          {isCurrentUserAdmin && memberId !== currentUser?.uid && (
            <View style={styles.actionsSection}>
              <Text style={styles.actionsSectionTitle}>Admin Actions</Text>

              {member.isAdmin ? (
                <Button
                  title="Remove Admin Status"
                  onPress={handleRemoveAdmin}
                  loading={processingAction}
                  disabled={processingAction}
                  variant="outline"
                  style={styles.actionButton}
                />
              ) : (
                <Button
                  title="Make Admin"
                  onPress={handleMakeAdmin}
                  loading={processingAction}
                  disabled={processingAction}
                  style={styles.actionButton}
                />
              )}

              <Button
                title="Remove from Group"
                onPress={handleRemoveMember}
                loading={processingAction}
                disabled={processingAction}
                variant="outline"
                style={{
                  marginBottom: 12,
                  borderColor: '#D32F2F',
                }}
                textStyle={{color: '#D32F2F'}}
              />

              <TouchableOpacity
                style={styles.reportButton}
                onPress={() => setReportModalVisible(true)}>
                <Icon name="flag" size={20} color="#FF9800" />
                <Text style={styles.reportButtonText}>Report User</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Report Modal */}
      <ReportContentModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        contentType="user"
        reportedUserId={memberId}
        reportedUserName={member.name}
        groupId={groupId}
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
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#D32F2F',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 24,
    color: '#2196F3',
  },
  headerPlaceholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  profileSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    margin: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  profileInitials: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  initialsText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 4,
  },
  profilePosition: {
    fontSize: 16,
    color: '#757575',
    marginBottom: 8,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#FFA000',
    marginTop: 4,
  },
  adminBadgeText: {
    color: '#FF8F00',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  infoSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  infoLabel: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#212121',
    marginBottom: 4,
  },
  sobrietyTime: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '500',
  },
  actionsSection: {
    marginTop: 8,
  },
  actionsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 16,
  },
  actionButton: {
    color: '#D32F2F',
    marginBottom: 12,
  },
  phoneActionsContainer: {
    flexDirection: 'row',
    marginTop: 8,
  },
  phoneActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 12,
  },
  phoneActionText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  servicePositionsList: {
    gap: 8,
  },
  servicePositionsIconContainer: {
    marginLeft: 4,
    paddingBottom: 6,
  },
  servicePositionItem: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
  },
  servicePositionHeader: {
    marginBottom: 4,
  },
  servicePositionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 2,
  },
  servicePositionDescription: {
    fontSize: 14,
    color: '#757575',
    marginTop: 2,
  },
  servicePositionTerm: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  servicePositionTermText: {
    fontSize: 12,
    color: '#757575',
    marginLeft: 4,
  },
  sponsorshipStatus: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
  },
  sponsorshipIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  sponsorshipInfo: {
    flex: 1,
  },
  sponsorshipText: {
    fontSize: 16,
    color: '#212121',
    marginBottom: 4,
  },
  sponsorshipDetail: {
    fontSize: 14,
    color: '#757575',
    marginTop: 2,
  },
  reportSection: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF9800',
    backgroundColor: '#FFF8E1',
  },
  reportButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '500',
    color: '#FF9800',
  },
});

export default MemberDetailScreen;
