import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {HomeGroup} from '../../types';

const {width} = Dimensions.get('window');

interface GroupPreviewCardProps {
  group: HomeGroup;
  onJoin: () => Promise<void>;
  onGoBack: () => void;
  mode: 'admin' | 'member';
}

const GroupPreviewCard: React.FC<GroupPreviewCardProps> = ({
  group,
  onJoin,
  onGoBack,
  mode,
}) => {
  const [isJoining, setIsJoining] = useState(false);

  const locationText = [group.city, group.state].filter(Boolean).join(', ');
  const isClaimed = group.admins && group.admins.length > 0;

  const handleJoin = async () => {
    setIsJoining(true);
    try {
      await onJoin();
    } finally {
      setIsJoining(false);
    }
  };

  const getActionButtonText = () => {
    if (mode === 'admin') {
      return isClaimed ? 'Request Admin Access' : 'Claim This Group';
    }
    return 'Join This Group';
  };

  const getActionButtonIcon = () => {
    if (mode === 'admin') {
      return isClaimed ? 'account-key' : 'account-cog';
    }
    return 'account-plus';
  };

  return (
    <View style={styles.container}>
      {/* Back button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={onGoBack}
        testID="group-preview-back-button">
        <Icon name="arrow-left" size={24} color="#424242" />
        <Text style={styles.backText}>Back to search</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Group Card */}
        <View style={styles.card}>
          {/* Header with icon */}
          <View style={styles.cardHeader}>
            <View style={styles.groupIconLarge}>
              <Icon name="account-group" size={40} color="#2196F3" />
            </View>
            {isClaimed && (
              <View style={styles.verifiedBadge}>
                <Icon name="check-decagram" size={16} color="#4CAF50" />
                <Text style={styles.verifiedText}>Verified Group</Text>
              </View>
            )}
          </View>

          {/* Group Name */}
          <Text style={styles.groupName}>{group.name}</Text>

          {/* Location */}
          {locationText ? (
            <View style={styles.infoRow}>
              <Icon name="map-marker" size={18} color="#757575" />
              <Text style={styles.infoText}>{locationText}</Text>
            </View>
          ) : null}

          {/* Member count */}
          <View style={styles.infoRow}>
            <Icon name="account-multiple" size={18} color="#757575" />
            <Text style={styles.infoText}>
              {group.memberCount || 0} members
            </Text>
          </View>

          {/* Type */}
          {group.type && (
            <View style={styles.infoRow}>
              <Icon name="tag" size={18} color="#757575" />
              <Text style={styles.infoText}>{group.type}</Text>
            </View>
          )}

          {/* Description */}
          {group.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.descriptionLabel}>About</Text>
              <Text style={styles.descriptionText}>{group.description}</Text>
            </View>
          )}

          {/* Meeting info hint */}
          <View style={styles.meetingHint}>
            <Icon name="calendar-clock" size={20} color="#FF9800" />
            <Text style={styles.meetingHintText}>
              View meeting schedule after joining
            </Text>
          </View>
        </View>

        {/* Confirmation section */}
        <View style={styles.confirmSection}>
          <Text style={styles.confirmTitle}>Is this your group?</Text>
          <Text style={styles.confirmSubtitle}>
            {mode === 'admin'
              ? 'You can manage this group after setup'
              : 'Join to access group features and chat'}
          </Text>

          {/* Action Button */}
          <TouchableOpacity
            style={[
              styles.actionButton,
              isJoining && styles.actionButtonDisabled,
            ]}
            onPress={handleJoin}
            disabled={isJoining}
            testID="group-preview-join-button">
            {isJoining ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Icon name={getActionButtonIcon()} size={22} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>
                  {getActionButtonText()}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Not my group link */}
          <TouchableOpacity
            style={styles.notMyGroupButton}
            onPress={onGoBack}
            testID="group-preview-not-my-group">
            <Text style={styles.notMyGroupText}>This isn't my group</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width,
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    gap: 8,
  },
  backText: {
    fontSize: 16,
    color: '#424242',
    fontWeight: '500',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  groupIconLarge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  groupName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  infoText: {
    fontSize: 15,
    color: '#616161',
  },
  descriptionSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  descriptionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 15,
    color: '#424242',
    lineHeight: 22,
  },
  meetingHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    gap: 10,
  },
  meetingHintText: {
    fontSize: 14,
    color: '#F57C00',
    flex: 1,
  },
  confirmSection: {
    marginTop: 20,
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  confirmSubtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 10,
    width: '100%',
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  notMyGroupButton: {
    marginTop: 16,
    paddingVertical: 12,
  },
  notMyGroupText: {
    fontSize: 15,
    color: '#757575',
  },
});

export default GroupPreviewCard;
