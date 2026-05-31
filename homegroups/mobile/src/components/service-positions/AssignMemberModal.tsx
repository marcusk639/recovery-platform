import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  selectMembersByGroupId,
  fetchGroupMembers,
} from '../../store/slices/membersSlice';
import {updateServicePosition} from '../../store/slices/servicePositionsSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {GroupMember} from '../../types';

interface AssignMemberModalProps {
  visible: boolean;
  groupId: string;
  positionId: string;
  positionName: string;
  currentHolderId?: string | null;
  onClose: () => void;
}

const AssignMemberModal: React.FC<AssignMemberModalProps> = ({
  visible,
  groupId,
  positionId,
  positionName,
  currentHolderId,
  onClose,
}) => {
  const dispatch = useAppDispatch();
  const members = useAppSelector(state =>
    selectMembersByGroupId(state, groupId),
  );
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUnassigning, setIsUnassigning] = useState(false);

  useEffect(() => {
    if (visible) {
      dispatch(fetchGroupMembers(groupId));
      // Reset selection when modal opens
      setSelectedMemberId(null);
    }
  }, [dispatch, groupId, visible]);

  const handleSelectMember = (memberId: string) => {
    setSelectedMemberId(memberId);
  };

  const handleUnassign = async () => {
    setIsUnassigning(true);
    try {
      await dispatch(
        updateServicePosition({
          groupId,
          positionId,
          updateData: {
            currentHolderId: null,
            currentHolderName: null,
          },
        }),
      ).unwrap();

      onClose();
    } catch (error: any) {
      console.error('Error unassigning member:', error);
    } finally {
      setIsUnassigning(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedMemberId) return;

    setIsSaving(true);
    try {
      const selectedMember = members.find(m => m.id === selectedMemberId);
      if (!selectedMember) throw new Error('Selected member not found');

      await dispatch(
        updateServicePosition({
          groupId,
          positionId,
          updateData: {
            currentHolderId: selectedMemberId,
            currentHolderName: selectedMember.name,
          },
        }),
      ).unwrap();

      onClose();
    } catch (error: any) {
      console.error('Error assigning member:', error);
      // Error is handled by the thunk
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
        testID={`assign-member-item-${item.id}`}>
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
          <Icon
            name="shield-account"
            size={18}
            color="#FFA000"
            style={styles.adminIcon}
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Assign {positionName}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Unassign button - only show if position is currently filled */}
          {currentHolderId && (
            <TouchableOpacity
              style={styles.unassignButton}
              onPress={handleUnassign}
              disabled={isUnassigning}
              testID="unassign-position-button">
              {isUnassigning ? (
                <ActivityIndicator color="#F44336" size="small" />
              ) : (
                <>
                  <Icon name="account-remove" size={20} color="#F44336" />
                  <Text style={styles.unassignButtonText}>
                    Unassign Current Holder
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <FlatList
            data={members}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No members found in this group.
              </Text>
            }
          />

          <TouchableOpacity
            style={[
              styles.assignButton,
              (!selectedMemberId || isSaving) && styles.disabledButton,
            ]}
            onPress={handleAssign}
            disabled={!selectedMemberId || isSaving}>
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.assignButtonText}>Assign Member</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    width: '90%',
    maxHeight: '80%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#757575',
  },
  list: {
    paddingVertical: 8,
  },
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
  adminIcon: {
    marginLeft: 8,
  },
  assignButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    borderRadius: 8,
  },
  disabledButton: {
    opacity: 0.7,
  },
  assignButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#757575',
    fontSize: 16,
  },
  unassignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  unassignButtonText: {
    color: '#F44336',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default AssignMemberModal;
