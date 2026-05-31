import React, {useState, useEffect, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  TextInput,
  FlatList,
} from 'react-native';
import {useRoute, RouteProp, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';

import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {selectGroupById, fetchGroupById} from '../../store/slices/groupsSlice';

type TreasurerHandoffScreenRouteProp = RouteProp<
  GroupStackParamList,
  'TreasurerHandoff'
>;
type TreasurerHandoffScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'TreasurerHandoff'
>;

interface Member {
  id: string;
  userId: string;
  displayName: string;
  role?: string;
}

interface PendingHandoff {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  initiatedAt: any;
  message?: string;
}

const TreasurerHandoffScreen: React.FC = () => {
  const route = useRoute<TreasurerHandoffScreenRouteProp>();
  const navigation = useNavigation<TreasurerHandoffScreenNavigationProp>();
  const dispatch = useAppDispatch();
  const {groupId, groupName} = route.params;

  const currentUser = auth().currentUser;
  const group = useAppSelector(state => selectGroupById(state, groupId));

  const [members, setMembers] = useState<Member[]>([]);
  const [pendingHandoff, setPendingHandoff] = useState<PendingHandoff | null>(
    null,
  );
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isTreasurer = useMemo(() => {
    return group?.treasurers?.includes(currentUser?.uid || '') || false;
  }, [group, currentUser]);

  const isPendingRecipient = useMemo(() => {
    return pendingHandoff?.toUserId === currentUser?.uid;
  }, [pendingHandoff, currentUser]);

  const isPendingInitiator = useMemo(() => {
    return pendingHandoff?.fromUserId === currentUser?.uid;
  }, [pendingHandoff, currentUser]);

  useEffect(() => {
    loadData();
    subscribeToHandoffChanges();
  }, [groupId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Fetch group if not in store
      if (!group) {
        dispatch(fetchGroupById(groupId));
      }

      // Fetch members
      const membersSnap = await firestore()
        .collection('members')
        .where('groupId', '==', groupId)
        .get();

      const membersList: Member[] = [];
      for (const doc of membersSnap.docs) {
        const data = doc.data();
        if (data.userId && data.userId !== currentUser?.uid) {
          // Get user display name
          const userSnap = await firestore()
            .collection('users')
            .doc(data.userId)
            .get();
          const userData = userSnap.data();

          membersList.push({
            id: doc.id,
            userId: data.userId,
            displayName: userData?.displayName || data.name || 'Unknown Member',
            role: data.role,
          });
        }
      }

      setMembers(membersList);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load member data.');
    } finally {
      setIsLoading(false);
    }
  };

  const subscribeToHandoffChanges = () => {
    // Subscribe to group changes to monitor pending handoff
    const unsubscribe = firestore()
      .collection('groups')
      .doc(groupId)
      .onSnapshot(
        snapshot => {
          const data = snapshot.data();
          setPendingHandoff(data?.pendingTreasurerHandoff || null);
        },
        error => {
          console.error('Error subscribing to handoff changes:', error);
        },
      );

    return () => unsubscribe();
  };

  const filteredMembers = useMemo(() => {
    if (!searchQuery) return members;
    const query = searchQuery.toLowerCase();
    return members.filter(m =>
      m.displayName.toLowerCase().includes(query),
    );
  }, [members, searchQuery]);

  const handleInitiateHandoff = async () => {
    if (!selectedMember) {
      Alert.alert('Select Member', 'Please select a member to transfer the role to.');
      return;
    }

    Alert.alert(
      'Confirm Transfer',
      `Are you sure you want to transfer the treasurer role to ${selectedMember.displayName}? They will need to accept the transfer.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Transfer',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const initiate = functions().httpsCallable(
                'initiateTreasurerHandoff',
              );
              await initiate({
                groupId,
                toUserId: selectedMember.userId,
                message: message.trim() || undefined,
              });

              Alert.alert(
                'Transfer Initiated',
                `A transfer request has been sent to ${selectedMember.displayName}. They will need to accept it to complete the transfer.`,
              );
              setSelectedMember(null);
              setMessage('');
            } catch (error: any) {
              console.error('Error initiating handoff:', error);
              Alert.alert(
                'Error',
                error.message || 'Failed to initiate transfer.',
              );
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const handleAcceptHandoff = async () => {
    Alert.alert(
      'Accept Treasurer Role',
      'By accepting, you will become the treasurer for this group. This responsibility includes managing the group\'s finances.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Accept',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const complete = functions().httpsCallable(
                'completeTreasurerHandoff',
              );
              await complete({groupId});

              Alert.alert(
                'Success',
                'You are now the treasurer for this group.',
                [{text: 'OK', onPress: () => navigation.goBack()}],
              );
            } catch (error: any) {
              console.error('Error accepting handoff:', error);
              Alert.alert(
                'Error',
                error.message || 'Failed to accept transfer.',
              );
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const handleDeclineHandoff = async () => {
    Alert.alert(
      'Decline Transfer',
      'Are you sure you want to decline the treasurer role?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const cancel = functions().httpsCallable(
                'cancelTreasurerHandoff',
              );
              await cancel({groupId});

              Alert.alert('Declined', 'You have declined the treasurer role.');
            } catch (error: any) {
              console.error('Error declining handoff:', error);
              Alert.alert(
                'Error',
                error.message || 'Failed to decline transfer.',
              );
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const handleCancelHandoff = async () => {
    Alert.alert(
      'Cancel Transfer',
      'Are you sure you want to cancel the transfer request?',
      [
        {text: 'No', style: 'cancel'},
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const cancel = functions().httpsCallable(
                'cancelTreasurerHandoff',
              );
              await cancel({groupId});

              Alert.alert('Cancelled', 'Transfer request has been cancelled.');
            } catch (error: any) {
              console.error('Error cancelling handoff:', error);
              Alert.alert(
                'Error',
                error.message || 'Failed to cancel transfer.',
              );
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const renderMemberItem = ({item}: {item: Member}) => {
    const isSelected = selectedMember?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.memberItem, isSelected && styles.memberItemSelected]}
        onPress={() => setSelectedMember(isSelected ? null : item)}>
        <View style={styles.memberAvatar}>
          <Icon
            name="account"
            size={24}
            color={isSelected ? '#1976D2' : '#757575'}
          />
        </View>
        <View style={styles.memberInfo}>
          <Text
            style={[
              styles.memberName,
              isSelected && styles.memberNameSelected,
            ]}>
            {item.displayName}
          </Text>
          {item.role && <Text style={styles.memberRole}>{item.role}</Text>}
        </View>
        {isSelected && (
          <Icon name="check-circle" size={24} color="#1976D2" />
        )}
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Pending Handoff - Recipient View
  if (pendingHandoff && isPendingRecipient) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.pendingCard}>
            <Icon name="account-switch" size={64} color="#FF9800" />
            <Text style={styles.pendingTitle}>Treasurer Role Transfer</Text>
            <Text style={styles.pendingDescription}>
              {pendingHandoff.fromUserName} wants to transfer the treasurer role
              to you.
            </Text>

            {pendingHandoff.message && (
              <View style={styles.messageBox}>
                <Icon name="message-text" size={20} color="#757575" />
                <Text style={styles.messageText}>{pendingHandoff.message}</Text>
              </View>
            )}

            <View style={styles.responsibilityBox}>
              <Text style={styles.responsibilityTitle}>
                Treasurer Responsibilities:
              </Text>
              <Text style={styles.responsibilityItem}>
                • Manage group income and expenses
              </Text>
              <Text style={styles.responsibilityItem}>
                • Record all financial transactions
              </Text>
              <Text style={styles.responsibilityItem}>
                • Generate financial reports for business meetings
              </Text>
              <Text style={styles.responsibilityItem}>
                • Maintain the prudent reserve
              </Text>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.declineButton]}
                onPress={handleDeclineHandoff}
                disabled={isSubmitting}>
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#C62828" />
                ) : (
                  <>
                    <Icon name="close" size={20} color="#C62828" />
                    <Text style={styles.declineButtonText}>Decline</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.acceptButton]}
                onPress={handleAcceptHandoff}
                disabled={isSubmitting}>
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Icon name="check" size={20} color="#FFFFFF" />
                    <Text style={styles.acceptButtonText}>Accept Role</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Pending Handoff - Initiator View (Waiting)
  if (pendingHandoff && isPendingInitiator) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.pendingCard}>
            <Icon name="clock-outline" size={64} color="#FF9800" />
            <Text style={styles.pendingTitle}>Transfer Pending</Text>
            <Text style={styles.pendingDescription}>
              Waiting for {pendingHandoff.toUserName} to accept the treasurer
              role.
            </Text>

            <View style={styles.pendingStatus}>
              <ActivityIndicator size="small" color="#FF9800" />
              <Text style={styles.pendingStatusText}>
                Awaiting response...
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.cancelTransferButton]}
              onPress={handleCancelHandoff}
              disabled={isSubmitting}>
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#C62828" />
              ) : (
                <Text style={styles.cancelTransferButtonText}>
                  Cancel Transfer
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Not a treasurer - show info
  if (!isTreasurer) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.noAccessContainer}>
          <Icon name="account-lock" size={64} color="#BDBDBD" />
          <Text style={styles.noAccessTitle}>Not a Treasurer</Text>
          <Text style={styles.noAccessText}>
            Only current treasurers can initiate a role transfer.
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

  // Initiator View - Select new treasurer
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Icon name="account-switch" size={48} color="#FF9800" />
        <Text style={styles.headerTitle}>Transfer Treasurer Role</Text>
        <Text style={styles.headerSubtitle}>
          Select a group member to transfer the treasurer role to.
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <Icon name="magnify" size={20} color="#757575" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search members..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9E9E9E"
        />
      </View>

      <FlatList
        data={filteredMembers}
        renderItem={renderMemberItem}
        keyExtractor={item => item.id}
        style={styles.membersList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery
                ? 'No members found matching your search.'
                : 'No other members in this group.'}
            </Text>
          </View>
        }
      />

      {selectedMember && (
        <View style={styles.selectionFooter}>
          <Text style={styles.selectedText}>
            Transfer to: {selectedMember.displayName}
          </Text>

          <TextInput
            style={styles.messageInput}
            placeholder="Add a message (optional)"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={200}
            placeholderTextColor="#9E9E9E"
          />

          <TouchableOpacity
            style={[
              styles.initiateButton,
              isSubmitting && styles.initiateButtonDisabled,
            ]}
            onPress={handleInitiateHandoff}
            disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Icon name="send" size={20} color="#FFFFFF" />
                <Text style={styles.initiateButtonText}>
                  Initiate Transfer
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollContent: {
    padding: 16,
    flexGrow: 1,
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
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
    color: '#212121',
  },
  membersList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  memberItemSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#E3F2FD',
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
  },
  memberNameSelected: {
    color: '#1976D2',
  },
  memberRole: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
  selectionFooter: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  selectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 12,
  },
  messageInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#212121',
    minHeight: 60,
    maxHeight: 100,
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  initiateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9800',
    padding: 14,
    borderRadius: 8,
    gap: 8,
  },
  initiateButtonDisabled: {
    backgroundColor: '#FFCC80',
  },
  initiateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pendingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pendingTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#212121',
    marginTop: 16,
    textAlign: 'center',
  },
  pendingDescription: {
    fontSize: 16,
    color: '#616161',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 24,
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    width: '100%',
    gap: 8,
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    color: '#424242',
    fontStyle: 'italic',
  },
  responsibilityBox: {
    backgroundColor: '#FFF3E0',
    padding: 16,
    borderRadius: 8,
    marginTop: 20,
    width: '100%',
  },
  responsibilityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 8,
  },
  responsibilityItem: {
    fontSize: 13,
    color: '#424242',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    gap: 6,
  },
  declineButton: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  declineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#C62828',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  acceptButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pendingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 8,
  },
  pendingStatusText: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '500',
  },
  cancelTransferButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C62828',
  },
  cancelTransferButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#C62828',
  },
  noAccessContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  noAccessTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
    marginTop: 16,
  },
  noAccessText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginTop: 8,
  },
  backButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: '#2196F3',
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default TreasurerHandoffScreen;

