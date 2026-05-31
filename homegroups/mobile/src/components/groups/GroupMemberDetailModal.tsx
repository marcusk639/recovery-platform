// src/components/groups/GroupMemberDetailModal.tsx

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {Button} from '../common/Button';
import {useAppSelector} from '../../store';
import {selectServicePositionsByMember} from '../../store/slices/servicePositionsSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface GroupMember {
  id: string;
  name: string;
  sobrietyDate?: string;
  showSobrietyDate?: boolean;
  position?: string;
  isAdmin: boolean;
}

interface GroupMemberDetailModalProps {
  visible: boolean;
  member: GroupMember;
  isAdmin: boolean;
  isCurrentUser: boolean;
  onClose: () => void;
  onMakeAdmin: () => void;
  onRemoveAdmin: () => void;
  onRemoveMember: () => void;
}

const GroupMemberDetailModal: React.FC<GroupMemberDetailModalProps> = ({
  visible,
  member,
  isAdmin,
  isCurrentUser,
  onClose,
  onMakeAdmin,
  onRemoveAdmin,
  onRemoveMember,
}) => {
  const servicePositions = useAppSelector(state =>
    selectServicePositionsByMember(state, member.id),
  );

  // Format recovery date for display
  const formatRecoveryDate = (dateString?: string): string => {
    if (!dateString) return 'Not shared';

    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (error) {
      return dateString;
    }
  };

  // Calculate sobriety time
  const calculateSobrietyTime = (dateString?: string): string => {
    if (!dateString) return 'Not shared';

    try {
      const recoveryDate = new Date(dateString);
      const today = new Date();

      const diffTime = Math.abs(today.getTime() - recoveryDate.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      const years = Math.floor(diffDays / 365);
      const months = Math.floor((diffDays % 365) / 30);
      const days = diffDays % 30;

      let sobrietyText = '';

      if (years > 0) {
        sobrietyText += `${years} ${years === 1 ? 'year' : 'years'}`;
      }

      if (months > 0) {
        sobrietyText += sobrietyText
          ? `, ${months} ${months === 1 ? 'month' : 'months'}`
          : `${months} ${months === 1 ? 'month' : 'months'}`;
      }

      if (days > 0 || (!years && !months)) {
        sobrietyText += sobrietyText
          ? `, ${days} ${days === 1 ? 'day' : 'days'}`
          : `${days} ${days === 1 ? 'day' : 'days'}`;
      }

      return sobrietyText;
    } catch (error) {
      return 'Not shared';
    }
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
            <Text style={styles.modalTitle}>Member Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.memberHeader}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberInitial}>
                  {member.name.charAt(0)}
                </Text>
              </View>

              <Text style={styles.memberName}>
                {member.name} {isCurrentUser ? '(You)' : ''}
              </Text>

              {member.isAdmin && (
                <View style={styles.adminBadge}>
                  <Icon name="shield-account" size={14} color="#2196F3" />
                  <Text style={styles.adminText}>Admin</Text>
                </View>
              )}
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Role</Text>
              <Text style={styles.detailText}>
                {member.position || 'Member'}
              </Text>
            </View>

            {servicePositions.length > 0 && (
              <View style={styles.detailSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Service Positions</Text>
                  <Icon name="badge-account" size={16} color="#2196F3" />
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

            {member.sobrietyDate && member.showSobrietyDate === true && (
              <View style={styles.detailSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recovery Info</Text>
                  <Icon name="calendar-check" size={16} color="#2196F3" />
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Recovery Date:</Text>
                  <Text style={styles.detailText}>
                    {formatRecoveryDate(member.sobrietyDate)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Sobriety Time:</Text>
                  <Text style={styles.detailText}>
                    {calculateSobrietyTime(member.sobrietyDate)}
                  </Text>
                </View>
              </View>
            )}

            {/* Admin Actions */}
            {isAdmin && !isCurrentUser && (
              <View style={styles.actionSection}>
                <Text style={styles.sectionTitle}>Admin Actions</Text>

                {member.isAdmin ? (
                  <Button
                    title="Remove Admin Status"
                    variant="outline"
                    onPress={onRemoveAdmin}
                    style={styles.actionButton}
                  />
                ) : (
                  <Button
                    title="Make Admin"
                    variant="outline"
                    onPress={onMakeAdmin}
                    style={styles.actionButton}
                  />
                )}

                <Button
                  title="Remove from Group"
                  variant="outline"
                  onPress={onRemoveMember}
                  style={{...styles.actionButton, ...styles.removeButton}}
                  textStyle={styles.removeButtonText}
                />
              </View>
            )}
          </ScrollView>
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
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
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
    fontSize: 18,
    color: '#757575',
  },
  modalContent: {
    padding: 16,
  },
  memberHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  memberAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  memberInitial: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  memberName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  adminBadge: {
    backgroundColor: '#FFF9C4',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  adminText: {
    fontSize: 12,
    color: '#FFA000',
    fontWeight: '500',
  },
  detailSection: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#757575',
    width: 120,
  },
  detailText: {
    fontSize: 16,
    color: '#212121',
    flex: 1,
  },
  actionSection: {
    marginBottom: 24,
  },
  actionButton: {
    marginBottom: 12,
  },
  removeButton: {
    borderColor: '#F44336',
  },
  removeButtonText: {
    color: '#F44336',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  servicePositionsList: {
    gap: 8,
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
});

export default GroupMemberDetailModal;
