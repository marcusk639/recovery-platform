import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

interface UnreadBadgeProps {
  count: number;
  size?: 'small' | 'medium';
}

const UnreadBadge: React.FC<UnreadBadgeProps> = ({count, size = 'medium'}) => {
  if (count <= 0) {
    return null;
  }

  const displayCount = count > 99 ? '99+' : count.toString();
  const isSmall = size === 'small';

  return (
    <View
      style={[
        styles.badge,
        {
          minWidth: isSmall ? 16 : 20,
          height: isSmall ? 16 : 20,
          borderRadius: isSmall ? 8 : 10,
        },
      ]}>
      <Text style={[styles.text, {fontSize: isSmall ? 10 : 12}]}>
        {displayCount}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default UnreadBadge;
