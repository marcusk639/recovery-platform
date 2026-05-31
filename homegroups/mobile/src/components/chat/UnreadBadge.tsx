/**
 * UnreadBadge Component
 *
 * Visual indicator for unread messages in group chat.
 * Shows a red dot badge, optionally positioned absolutely.
 */

import React from 'react';
import {View, StyleSheet, ViewStyle} from 'react-native';

interface UnreadBadgeProps {
  /** Whether there are unread messages */
  hasUnread: boolean;
  /** Size of the badge dot */
  size?: 'small' | 'medium' | 'large';
  /** Position the badge absolutely (for overlaying on icons) */
  absolute?: boolean;
  /** Custom style overrides */
  style?: ViewStyle;
}

const SIZE_CONFIG = {
  small: 8,
  medium: 10,
  large: 12,
};

const UnreadBadge: React.FC<UnreadBadgeProps> = ({
  hasUnread,
  size = 'medium',
  absolute = false,
  style,
}) => {
  if (!hasUnread) {
    return null;
  }

  const dotSize = SIZE_CONFIG[size];

  return (
    <View
      style={[
        styles.badge,
        {
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
        },
        absolute && styles.absolutePosition,
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#F44336', // Red color for unread indicator
    borderWidth: 1.5,
    borderColor: '#FFFFFF', // White border for visibility on any background
  },
  absolutePosition: {
    position: 'absolute',
    top: -2,
    right: -2,
  },
});

export default UnreadBadge;
