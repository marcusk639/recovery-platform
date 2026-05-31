import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useRoute, RouteProp} from '@react-navigation/native';
import {useAppSelector, useAppDispatch} from '../../store';
import {selectMembersByGroupId} from '../../store/slices/membersSlice';
import {GroupMember} from '../../types';
import {formatDistanceToNow} from 'date-fns';
import {selectUser} from '../../store/slices/authSlice';
import {GroupStackParamList} from '../../types/navigation';
import {RootState} from '../../store/types';
import {SponsorSettings} from '../../types/sponsorship';
import UserImage from '../../components/UserImage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  requestSponsorship,
  selectAllSponsorships,
} from '../../store/slices/sponsorshipSlice';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';

type ScreenRouteProp = RouteProp<GroupStackParamList, 'GroupSponsors'>;

/** Shape returned by getCrossGroupSponsors callable. */
interface CrossGroupSponsor {
  userId: string;
  displayName: string;
  sobrietyDate?: string | null;
  bio?: string;
  requirements?: string[];
  isAvailable: boolean;
  groupId: string;
  groupName: string;
  photoUrl?: string | null;
}

/**
 * Adapts a CrossGroupSponsor into the GroupMember shape expected by
 * the existing renderSponsor function. Non-applicable fields are left blank.
 */
const crossGroupSponsorToMember = (
  s: CrossGroupSponsor,
): GroupMember & {_groupName?: string} => ({
  id: s.userId,
  groupId: s.groupId,
  userId: s.userId,
  name: s.displayName,
  photoUrl: s.photoUrl ?? undefined,
  sobrietyDate: s.sobrietyDate ?? undefined,
  showSobrietyDate: s.sobrietyDate != null, // server already filters by privacy; this is defense-in-depth
  joinedAt: new Date(0),
  sponsorSettings: {
    isAvailable: true,
    bio: s.bio,
    requirements: s.requirements,
  } as SponsorSettings,
  // Extra field used to display the source group in cross-group mode
  _groupName: s.groupName,
});

const GroupSponsorsScreen = () => {
  const route = useRoute<ScreenRouteProp>();
  const {groupId} = route.params;
  const dispatch = useAppDispatch();
  const currentUser = auth().currentUser;

  // ---- View mode toggle ----
  const [viewMode, setViewMode] = useState<'this_group' | 'my_groups'>(
    'this_group',
  );
  const [crossGroupSponsors, setCrossGroupSponsors] = useState<
    CrossGroupSponsor[]
  >([]);
  const [crossGroupLoading, setCrossGroupLoading] = useState(false);

  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [selectedSponsor, setSelectedSponsor] = useState<
    (GroupMember & {_groupName?: string}) | null
  >(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const members = useAppSelector((state: RootState) =>
    selectMembersByGroupId(state, groupId),
  );
  const sponsorships = useAppSelector(selectAllSponsorships);

  // Check if user already has an active sponsor in this group
  const hasActiveSponsor = sponsorships.some(
    s =>
      s.groupId === groupId &&
      s.sponseeId === currentUser?.uid &&
      s.status === 'active',
  );

  const isSponsorAvailable = (settings: SponsorSettings | undefined) =>
    settings?.isAvailable ?? false;

  const availableSponsors = members.filter(
    member =>
      isSponsorAvailable(member.sponsorSettings) &&
      member.userId !== currentUser?.uid,
  );

  // ---- Cross-group sponsors fetch ----
  const fetchCrossGroupSponsors = async () => {
    setCrossGroupLoading(true);
    try {
      const callable = functions().httpsCallable('getCrossGroupSponsors');
      const result = await callable({});
      const data = result.data as {sponsors: CrossGroupSponsor[]};
      // Filter out current user just in case
      const filtered = (data.sponsors || []).filter(
        s => s.userId !== currentUser?.uid,
      );
      setCrossGroupSponsors(filtered);
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.message || 'Failed to load sponsors from your groups.',
      );
    } finally {
      setCrossGroupLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'my_groups') {
      fetchCrossGroupSponsors();
    }
  }, [viewMode]);

  // The list displayed depends on the view mode
  const sponsorsToShow: Array<GroupMember & {_groupName?: string}> =
    viewMode === 'this_group'
      ? availableSponsors
      : crossGroupSponsors.map(crossGroupSponsorToMember);

  const handleRequestSponsor = (
    member: GroupMember & {_groupName?: string},
  ) => {
    if (hasActiveSponsor) {
      Alert.alert(
        'Already Have a Sponsor',
        'You already have an active sponsor in this group. You must end that relationship before requesting a new sponsor.',
      );
      return;
    }
    setSelectedSponsor(member);
    setRequestMessage('');
    setRequestModalVisible(true);
  };

  const handleSubmitRequest = async () => {
    if (!selectedSponsor || !requestMessage.trim()) {
      Alert.alert(
        'Message Required',
        'Please include a message with your request.',
      );
      return;
    }

    // When in cross-group mode, sponsor the request to their actual group
    const targetGroupId =
      viewMode === 'my_groups' && selectedSponsor._groupName
        ? crossGroupSponsors.find(s => s.userId === selectedSponsor.userId)
            ?.groupId ?? groupId
        : groupId;

    setSubmitting(true);
    try {
      await dispatch(
        requestSponsorship({
          groupId: targetGroupId,
          sponsorId: selectedSponsor.id,
          message: requestMessage.trim(),
        }),
      ).unwrap();

      setRequestModalVisible(false);
      Alert.alert(
        'Request Sent',
        `Your sponsorship request has been sent to ${selectedSponsor.name}. They will be notified and can accept or decline your request.`,
      );
    } catch (error: any) {
      Alert.alert(
        'Request Failed',
        error.message ||
          'Failed to send sponsorship request. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderSponsor = ({
    item: member,
  }: {
    item: GroupMember & {_groupName?: string};
  }) => {
    const showSobriety =
      member.showSobrietyDate !== false && member.sobrietyDate;
    const sobrietyDuration =
      showSobriety &&
      formatDistanceToNow(new Date(member.sobrietyDate!), {
        addSuffix: false,
      });

    return (
      <View style={styles.sponsorCard}>
        <View style={styles.sponsorHeader}>
          <UserImage
            photoUrl={member.photoUrl}
            displayName={member.name}
            style={styles.profileImage}
          />
          <View style={styles.sponsorInfo}>
            <Text style={styles.sponsorName}>{member.name}</Text>
            {showSobriety && sobrietyDuration && (
              <Text style={styles.sobrietyText}>
                Sober for {sobrietyDuration}
              </Text>
            )}
            {/* Show which group this sponsor is from in cross-group mode */}
            {viewMode === 'my_groups' && member._groupName && (
              <View style={styles.groupBadge}>
                <Icon name="account-group" size={12} color="#1565C0" />
                <Text style={styles.groupBadgeText}>{member._groupName}</Text>
              </View>
            )}
          </View>
        </View>

        {member.sponsorSettings?.bio && (
          <View style={styles.bioSection}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bioText}>{member.sponsorSettings.bio}</Text>
          </View>
        )}

        {member.sponsorSettings?.requirements &&
          member.sponsorSettings.requirements.length > 0 && (
            <View style={styles.requirementsSection}>
              <Text style={styles.sectionTitle}>Requirements</Text>
              {member.sponsorSettings.requirements.map((req, index) => (
                <Text key={index} style={styles.requirementText}>
                  • {req}
                </Text>
              ))}
            </View>
          )}

        <TouchableOpacity
          style={[
            styles.requestButton,
            hasActiveSponsor && styles.requestButtonDisabled,
          ]}
          onPress={() => handleRequestSponsor(member)}
          disabled={hasActiveSponsor}>
          <Icon
            name="hand-heart"
            size={20}
            color={hasActiveSponsor ? '#9E9E9E' : '#FFFFFF'}
          />
          <Text
            style={[
              styles.requestButtonText,
              hasActiveSponsor && styles.requestButtonTextDisabled,
            ]}>
            {hasActiveSponsor ? 'Already Have a Sponsor' : 'Request as Sponsor'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderToggle = () => (
    <View style={styles.toggleContainer}>
      <TouchableOpacity
        style={[
          styles.toggleButton,
          viewMode === 'this_group' && styles.toggleButtonActive,
        ]}
        onPress={() => setViewMode('this_group')}>
        <Text
          style={[
            styles.toggleButtonText,
            viewMode === 'this_group' && styles.toggleButtonTextActive,
          ]}>
          This Group
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.toggleButton,
          viewMode === 'my_groups' && styles.toggleButtonActive,
        ]}
        onPress={() => setViewMode('my_groups')}>
        <Text
          style={[
            styles.toggleButtonText,
            viewMode === 'my_groups' && styles.toggleButtonTextActive,
          ]}>
          My Groups
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderToggle()}

      {crossGroupLoading && viewMode === 'my_groups' ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>
            Loading sponsors from your groups...
          </Text>
        </View>
      ) : (
        <FlatList
          data={sponsorsToShow}
          renderItem={renderSponsor}
          keyExtractor={item => `${item.id}-${item._groupName ?? ''}`}
          contentContainerStyle={styles.listContent}
          testID="sponsors-list"
          ListHeaderComponent={
            hasActiveSponsor ? (
              <View style={styles.activeSponsorBanner}>
                <Icon name="information-outline" size={20} color="#1565C0" />
                <Text style={styles.activeSponsorBannerText}>
                  You already have an active sponsor in this group. View your
                  sponsorships from your Profile.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer} testID="sponsors-empty-state">
              <Icon name="account-heart-outline" size={64} color="#BDBDBD" />
              <Text style={styles.emptyText}>
                No sponsors available at this time
              </Text>
              <Text style={styles.emptySubtext}>
                {viewMode === 'my_groups'
                  ? 'No available sponsors found across your groups'
                  : 'Check back later or consider becoming a sponsor yourself'}
              </Text>
            </View>
          }
        />
      )}

      {/* Request Sponsorship Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={requestModalVisible}
        onRequestClose={() => setRequestModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Request Sponsorship</Text>

            {selectedSponsor && (
              <View style={styles.modalSponsorInfo}>
                <UserImage
                  photoUrl={selectedSponsor.photoUrl}
                  displayName={selectedSponsor.name}
                  style={styles.modalProfileImage}
                />
                <Text style={styles.modalSponsorName}>
                  {selectedSponsor.name}
                </Text>
                {viewMode === 'my_groups' && selectedSponsor._groupName && (
                  <Text style={styles.modalGroupName}>
                    from {selectedSponsor._groupName}
                  </Text>
                )}
              </View>
            )}

            <Text style={styles.modalDescription}>
              Write a message introducing yourself and explaining why you'd like
              this person to be your sponsor.
            </Text>

            <TextInput
              style={styles.messageInput}
              multiline
              numberOfLines={4}
              placeholder="Share a bit about yourself and your recovery journey..."
              value={requestMessage}
              onChangeText={setRequestMessage}
              textAlignVertical="top"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setRequestModalVisible(false)}
                disabled={submitting}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (!requestMessage.trim() || submitting) &&
                    styles.submitButtonDisabled,
                ]}
                onPress={handleSubmitRequest}
                disabled={!requestMessage.trim() || submitting}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Send Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleButtonActive: {
    backgroundColor: '#2196F3',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
  },
  toggleButtonTextActive: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#757575',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  activeSponsorBanner: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  activeSponsorBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#1565C0',
    marginLeft: 8,
    lineHeight: 20,
  },
  sponsorCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sponsorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  sponsorInfo: {
    flex: 1,
  },
  sponsorName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  sobrietyText: {
    fontSize: 14,
    color: '#666',
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  groupBadgeText: {
    fontSize: 12,
    color: '#1565C0',
    marginLeft: 4,
    fontWeight: '500',
  },
  bioSection: {
    marginBottom: 16,
  },
  requirementsSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  bioText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  requirementText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    lineHeight: 20,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  requestButtonDisabled: {
    backgroundColor: '#E0E0E0',
  },
  requestButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 8,
  },
  requestButtonTextDisabled: {
    color: '#9E9E9E',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    textAlign: 'center',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginTop: 8,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalSponsorInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalProfileImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 8,
  },
  modalSponsorName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  modalGroupName: {
    fontSize: 13,
    color: '#1565C0',
    marginTop: 2,
  },
  modalDescription: {
    fontSize: 14,
    color: '#757575',
    lineHeight: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  messageInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#212121',
    height: 120,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 12,
  },
  cancelButtonText: {
    color: '#757575',
    fontWeight: '600',
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    minWidth: 120,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default GroupSponsorsScreen;
