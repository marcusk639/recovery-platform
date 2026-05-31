// src/components/common/LoadingIndicator.tsx
import React from 'react';
import {View, ActivityIndicator, StyleSheet, ViewStyle} from 'react-native';
import theme from '../../theme';

interface LoadingIndicatorProps {
  size?: 'small' | 'large';
  color?: string;
  style?: ViewStyle;
  fullscreen?: boolean;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  size = 'small',
  color = theme.colors.primary.main,
  style,
  fullscreen = false,
}) => {
  if (fullscreen) {
    return (
      <View style={[styles.fullscreenContainer, style]}>
        <ActivityIndicator size={size} color={color} />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={size} color={color} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    zIndex: 999,
  },
});

export default LoadingIndicator;
