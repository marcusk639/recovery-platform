/**
 * ActivityStatusBadge Component
 *
 * Visual indicator for admin activity status (active, inactive, dormant).
 * Shows a colored badge with optional text and tooltip.
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {AdminActivityStatus} from '../../types';
import {formatInactivityDisplay} from '../../services/activityTracker';

interface ActivityStatusBadgeProps {
  status: AdminActivityStatus;
  inactivityDays?: number;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
  onPress?: () => void;
}

const STATUS_CONFIG: Record<
  AdminActivityStatus,
  {
    color: string;
    backgroundColor: string;
    icon: string;
    label: string;
  }
> = {
  active: {
    color: '#4CAF50',
    backgroundColor: '#E8F5E9',
    icon: 'check-circle',
    label: 'Active',
  },
  inactive: {
    color: '#FF9800',
    backgroundColor: '#FFF3E0',
    icon: 'clock-outline',
    label: 'Inactive',
  },
  dormant: {
    color: '#F44336',
    backgroundColor: '#FFEBEE',
    icon: 'sleep',
    label: 'Dormant',
  },
};

const SIZE_CONFIG = {
  small: {
    iconSize: 14,
    fontSize: 11,
    dotSize: 8,
    padding: 4,
  },
  medium: {
    iconSize: 16,
    fontSize: 13,
    dotSize: 10,
    padding: 6,
  },
  large: {
    iconSize: 20,
    fontSize: 15,
    dotSize: 12,
    padding: 8,
  },
};

const ActivityStatusBadge: React.FC<ActivityStatusBadgeProps> = ({
  status,
  inactivityDays,
  showLabel = true,
  size = 'medium',
  onPress,
}) => {
  const config = STATUS_CONFIG[status];
  const sizeConfig = SIZE_CONFIG[size];

  const content = (
    <View
      style={[
        styles.container,
        {
          backgroundColor: config.backgroundColor,
          paddingHorizontal: sizeConfig.padding + 4,
          paddingVertical: sizeConfig.padding,
        },
      ]}>
      <View
        style={[
          styles.dot,
          {
            width: sizeConfig.dotSize,
            height: sizeConfig.dotSize,
            backgroundColor: config.color,
          },
        ]}
      />
      {showLabel && (
        <Text
          style={[
            styles.label,
            {
              color: config.color,
              fontSize: sizeConfig.fontSize,
            },
          ]}>
          {config.label}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

/**
 * Compact dot-only version for lists
 */
export const ActivityStatusDot: React.FC<{
  status: AdminActivityStatus;
  size?: number;
}> = ({status, size = 10}) => {
  const config = STATUS_CONFIG[status];

  return (
    <View
      style={[
        styles.dotOnly,
        {
          width: size,
          height: size,
          backgroundColor: config.color,
        },
      ]}
    />
  );
};

/**
 * Full card version with detailed info
 */
export const ActivityStatusCard: React.FC<{
  status: AdminActivityStatus;
  inactivityDays: number;
  adminName?: string;
}> = ({status, inactivityDays, adminName}) => {
  const config = STATUS_CONFIG[status];
  const displayText = formatInactivityDisplay(inactivityDays);

  return (
    <View style={[styles.card, {borderLeftColor: config.color}]}>
      <View style={styles.cardHeader}>
        <Icon name={config.icon} size={20} color={config.color} />
        <Text style={[styles.cardTitle, {color: config.color}]}>
          {adminName ? `${adminName} - ${config.label}` : config.label}
        </Text>
      </View>
      <Text style={styles.cardSubtitle}>{displayText}</Text>
      {status === 'inactive' && (
        <Text style={styles.cardWarning}>
          Admin requests will auto-approve in 7 days if no response
        </Text>
      )}
      {status === 'dormant' && (
        <Text style={styles.cardWarning}>
          This group can be claimed immediately
        </Text>
      )}
    </View>
  );
};

/**
 * Inline text version for embedding in sentences
 */
export const ActivityStatusText: React.FC<{
  status: AdminActivityStatus;
  inactivityDays?: number;
}> = ({status, inactivityDays}) => {
  const config = STATUS_CONFIG[status];
  const displayText =
    inactivityDays !== undefined
      ? formatInactivityDisplay(inactivityDays)
      : config.label;

  return (
    <Text style={[styles.inlineText, {color: config.color}]}>
      <Icon name={config.icon} size={14} color={config.color} /> {displayText}
    </Text>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    gap: 6,
  },
  dot: {
    borderRadius: 50,
  },
  dotOnly: {
    borderRadius: 50,
  },
  label: {
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#757575',
    marginLeft: 28,
  },
  cardWarning: {
    fontSize: 12,
    color: '#FF9800',
    marginTop: 8,
    marginLeft: 28,
    fontStyle: 'italic',
  },
  inlineText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export default ActivityStatusBadge;

