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
  FlatList,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRoute, RouteProp, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {selectGroupById} from '../../store/slices/groupsSlice';
import {
  fetchGroupMembers,
  selectMembersByGroupId,
} from '../../store/slices/membersSlice';
import {
  selectTreasuryStatsByGroupId,
  fetchTreasuryStats,
} from '../../store/slices/treasurySlice';
import {initiateHandoff} from '../../store/slices/treasurerHandoffSlice';
import {GroupMember} from '../../types';

type InitiateHandoffScreenRouteProp = RouteProp<
  GroupStackParamList,
  'InitiateHandoff'
>;

type InitiateHandoffScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'InitiateHandoff'
>;

const InitiateHandoffScreen: React.FC = () => {
  const route = useRoute<InitiateHandoffScreenRouteProp>();
  const navigation = useNavigation<InitiateHandoffScreenNavigationProp>();
  const dispatch = useAppDispatch();
  const {groupId, groupName, positionId} = route.params;
  const currentUser = auth().currentUser;

  // State
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(
    null,
  );
  const [transitionNotes, setTransitionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Redux selectors
  const group = useAppSelector(state => selectGroupById(state, groupId));
  const members = useAppSelector(state =>
    selectMembersByGroupId(state, groupId),
  );
  const treasuryStats = useAppSelector(state =>
    selectTreasuryStatsByGroupId(state, groupId),
  );

  // Load data
  useEffect(() => {
    dispatch(fetchGroupMembers(groupId));
    dispatch(fetchTreasuryStats(groupId));
  }, [dispatch, groupId]);

  // Filter members (exclude current user and search)
  const filteredMembers = members.filter(member => {
    if (member.userId === currentUser?.uid) return false;
    if (searchQuery) {
      return member.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  // Format currency
  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

  // Handle initiate handoff
  const handleInitiateHandoff = async () => {
    if (!selectedMember) {
      Alert.alert('Error', 'Please select a member to transfer the role to');
      return;
    }

    Alert.alert(
      'Confirm Handoff',
      `Are you sure you want to transfer the Treasurer role to ${
        selectedMember.name
      }?\n\nCurrent Balance: ${formatCurrency(treasuryStats?.balance || 0)}`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Initiate Handoff',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await dispatch(
                initiateHandoff({
                  groupId,
                  positionId,
                  newTreasurerId: selectedMember.userId,
                  newTreasurerName: selectedMember.name,
                  transitionNotes: transitionNotes.trim() || undefined,
                }),
              ).unwrap();

              Alert.alert(
                'Handoff Initiated',
                `A handoff request has been sent to ${selectedMember.name}. They will need to accept before the transfer is complete.`,
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ],
              );
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.message || 'Failed to initiate handoff',
              );
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ],
    );
  };

  // Render member item
  const renderMemberItem = ({item}: {item: GroupMember}) => {
    const isSelected = selectedMember?.userId === item.userId;

    return (
      <TouchableOpacity
        style={[styles.memberItem, isSelected && styles.memberItemSelected]}
        onPress={() => setSelectedMember(item)}>
        <View style={styles.memberInfo}>
          <View style={styles.memberAvatar}>
            <Text style={styles.memberAvatarText}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.memberDetails}>
            <Text style={styles.memberName}>{item.name}</Text>
            {item.isAdmin && <Text style={styles.memberRole}>Admin</Text>}
          </View>
        </View>
        {isSelected && <Icon name="check-circle" size={24} color="#4CAF50" />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Icon name="account-switch" size={48} color="#1976D2" />
          <Text style={styles.headerTitle}>Transfer Treasurer Role</Text>
          <Text style={styles.headerSubtitle}>
            Select a member to transfer the treasurer responsibilities to
          </Text>
        </View>

        {/* Current Balance Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Treasury Status</Text>
          <View style={styles.balanceCard}>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Current Balance</Text>
              <Text style={styles.balanceValue}>
                {formatCurrency(treasuryStats?.balance || 0)}
              </Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Prudent Reserve</Text>
              <Text style={styles.balanceValue}>
                {formatCurrency(treasuryStats?.prudentReserve || 0)}
              </Text>
            </View>
          </View>
          <Text style={styles.balanceNote}>
            This balance will be recorded as part of the handoff record.
          </Text>
        </View>

        {/* Member Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select New Treasurer</Text>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Icon name="magnify" size={20} color="#757575" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search members..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Members List */}
          {filteredMembers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {searchQuery
                  ? 'No members match your search'
                  : 'No eligible members found'}
              </Text>
            </View>
          ) : (
            <View style={styles.membersList} testID="handoff-member-list">
              {filteredMembers.map(member => (
                <View key={member.id}>{renderMemberItem({item: member})}</View>
              ))}
            </View>
          )}
        </View>

        {/* Transition Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transition Notes (Optional)</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Add any important information for the incoming treasurer (e.g., upcoming expenses, vendor contacts, etc.)"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={transitionNotes}
            onChangeText={setTransitionNotes}
          />
        </View>

        {/* Selected Member Summary */}
        {selectedMember && (
          <View style={styles.selectedSummary}>
            <Icon name="information" size={20} color="#1976D2" />
            <Text style={styles.selectedSummaryText}>
              {selectedMember.name} will receive a notification to accept the
              treasurer role. The handoff will be complete once they accept and
              you confirm.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Action */}
      <View style={styles.bottomAction}>
        <TouchableOpacity
          style={[
            styles.initiateButton,
            (!selectedMember || isSubmitting) && styles.initiateButtonDisabled,
          ]}
          onPress={handleInitiateHandoff}
          disabled={!selectedMember || isSubmitting}>
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Icon name="send" size={20} color="#FFFFFF" />
              <Text style={styles.initiateButtonText}>Initiate Handoff</Text>
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
  balanceNote: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 8,
    fontStyle: 'italic',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
  },
  membersList: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  memberItemSelected: {
    backgroundColor: '#E3F2FD',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  memberDetails: {
    marginLeft: 12,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
  },
  memberRole: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9E9E9E',
  },
  notesInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
  },
  selectedSummary: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    margin: 16,
    padding: 12,
    borderRadius: 8,
  },
  selectedSummaryText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    marginLeft: 8,
  },
  bottomAction: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  initiateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    borderRadius: 8,
  },
  initiateButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  initiateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default InitiateHandoffScreen;
