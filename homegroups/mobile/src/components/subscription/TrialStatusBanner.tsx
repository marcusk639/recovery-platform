import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface TrialStatusBannerProps {
  daysRemaining: number;
  onUpgrade: () => void;
}

const TrialStatusBanner: React.FC<TrialStatusBannerProps> = ({
  daysRemaining,
  onUpgrade,
}) => {
  if (daysRemaining < 0) return null;

  const isUrgent = daysRemaining <= 2;
  const backgroundColor = isUrgent ? '#F44336' : '#E3F2FD';
  const textColor = isUrgent ? '#FFFFFF' : '#212121';

  const getMessage = () => {
    if (daysRemaining === 0) return 'Trial ends today!';
    if (daysRemaining === 1) return 'Trial ends tomorrow';
    return `${daysRemaining} days left in trial`;
  };

  return (
    <View style={[styles.container, {backgroundColor}]}>
      <View style={styles.content}>
        <Icon
          name={isUrgent ? 'alert-circle' : 'clock-outline'}
          size={20}
          color={textColor}
        />
        <View style={styles.textContainer}>
          <Text style={[styles.message, {color: textColor}]}>
            {getMessage()}
          </Text>
          {daysRemaining <= 3 && (
            <Text style={[styles.submessage, {color: textColor}]}>
              Keep treasury, announcements & more
            </Text>
          )}
        </View>
      </View>
      <TouchableOpacity style={styles.upgradeButton} onPress={onUpgrade}>
        <Text style={[styles.upgradeText, {color: '#2196F3'}]}>
          {isUrgent ? 'Upgrade Now' : 'Learn More'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  textContainer: {
    marginLeft: 10,
    flex: 1,
  },
  message: {
    fontSize: 14,
    fontWeight: '600',
  },
  submessage: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.9,
  },
  upgradeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'white',
  },
  upgradeText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default TrialStatusBanner;
