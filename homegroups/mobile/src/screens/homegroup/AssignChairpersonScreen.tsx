import React, {useState, useEffect, useLayoutEffect} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  selectMembersByGroupId,
  fetchGroupMembers,
} from '../../store/slices/membersSlice';
import {GroupMember} from '../../types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {MeetingModel} from '../../models/MeetingModel'; // Direct model call for now

type ScreenRouteProp = RouteProp<GroupStackParamList, 'AssignChairperson'>;
type ScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'AssignChairperson'
>;

const AssignChairpersonScreen: React.FC = () => {
  const route = useRoute<ScreenRouteProp>();
  const navigation = useNavigation<ScreenNavigationProp>();
  const {groupId, instanceId, groupName, currentChairpersonId, scheduledAt} =
    route.params;
  const dispatch = useAppDispatch();

  const members = useAppSelector(state =>
    selectMembersByGroupId(state, groupId),
  );
  // Fetch meeting instance details if needed, e.g., to show current chair name if ID is passed
  // const meetingInstance = useAppSelector(state => selectMeetingInstanceById(state, instanceId));
  const membersStatus = useAppSelector(state => state.members.status);

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    currentChairpersonId ?? null,
  );
  const [isSaving, setIsSaving] = useState(false);

  // Fetch members if not already loaded
  useEffect(() => {
    if (!members || members.length === 0) {
      dispatch(fetchGroupMembers(groupId));
    }
  }, [dispatch, groupId, members]);

  // Set header title
  useLayoutEffect(() => {
    const meetingDate = new Date(scheduledAt).toLocaleDateString();
    navigation.setOptions({title: `Assign Chair (${meetingDate})`});
  }, [navigation, scheduledAt]);

  const handleSelectMember = (memberId: string | null) => {
    setSelectedMemberId(memberId); // Allow selecting null (Clear Chair)
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const selectedMember = members.find(m => m.id === selectedMemberId);
      const chairpersonName = selectedMember ? selectedMember.name : null;

      // Call model method directly (or dispatch thunk if created)
      await MeetingModel.updateInstanceChairperson(
        instanceId,
        selectedMemberId,
        chairpersonName,
      );

      // Optional: Update Redux state immediately if needed, or rely on refresh
      // dispatch(updateMeetingInstance({ /* updated instance data */ }));

      Alert.alert(
        'Success',
        `Chairperson ${selectedMemberId ? 'assigned' : 'cleared'}.`,
      );
      navigation.goBack();
    } catch (error: any) {
      console.error('Error assigning chairperson:', error);
      Alert.alert('Error', error.message || 'Failed to assign chairperson.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderItem = ({item}: {item: GroupMember}) => {
    const isSelected = selectedMemberId === item.id;
    return (
      <TouchableOpacity
        style={[styles.memberItem, isSelected && styles.selectedMemberItem]}
        onPress={() => handleSelectMember(item.id)}
        testID={`assign-chair-member-item-${item.id}`}>
        <Icon
          name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
          size={24}
          color={isSelected ? '#2196F3' : '#BDBDBD'}
          style={styles.selectIcon}
        />
        <View style={styles.memberAvatar}>
          <Text style={styles.memberAvatarText}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.memberName}>{item.name}</Text>
        {item.isAdmin && (
          <View style={styles.adminBadge}>
            <Icon name="crown" size={16} color="#FFA000" />
            <Text style={styles.adminBadgeText}>Admin</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={styles.container}
      testID={`assign-chair-screen-${instanceId}`}>
      {membersStatus === 'loading' ? (
        <ActivityIndicator
          size="large"
          color="#2196F3"
          style={styles.loader}
          testID="assign-chair-loader"
        />
      ) : (
        <FlatList
          data={members}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          testID="assign-chair-member-list"
          ListHeaderComponent={
            // Option to clear the chairperson
            <TouchableOpacity
              style={[
                styles.memberItem,
                selectedMemberId === null && styles.selectedMemberItem,
              ]}
              onPress={() => handleSelectMember(null)}
              testID="assign-chair-clear-button">
              <Icon
                name={
                  selectedMemberId === null
                    ? 'radiobox-marked'
                    : 'radiobox-blank'
                }
                size={24}
                color={selectedMemberId === null ? '#2196F3' : '#BDBDBD'}
                style={styles.selectIcon}
              />
              <Icon
                name="account-off-outline"
                size={24}
                color="#757575"
                style={styles.clearIcon}
              />
              <Text style={styles.memberName}>
                (Clear Chairperson / No Chair)
              </Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText} testID="assign-chair-empty-list">
              No members found in this group.
            </Text>
          }
        />
      )}

      <TouchableOpacity
        style={[styles.saveButton, isSaving && styles.disabledButton]}
        onPress={handleSave}
        disabled={isSaving || selectedMemberId === currentChairpersonId} // Disable if no change
        testID="assign-chair-save-button">
        {isSaving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveButtonText}>Save Assignment</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#FFFFFF'},
  loader: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  list: {paddingVertical: 10},
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  selectedMemberItem: {
    backgroundColor: '#E3F2FD',
  },
  selectIcon: {
    marginRight: 16,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#90CAF9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  memberName: {
    fontSize: 16,
    color: '#212121',
    flex: 1,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#FFA000',
  },
  adminBadgeText: {
    fontSize: 10,
    color: '#FF8F00',
    fontWeight: '700',
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  clearIcon: {
    marginRight: 12,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    borderRadius: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.7,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#757575',
    fontSize: 16,
  },
});

export default AssignChairpersonScreen;
