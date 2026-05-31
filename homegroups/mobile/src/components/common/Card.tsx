import React from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  Animated,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewProps,
} from 'react-native';
import {theme} from '../../theme/theme';

interface CardProps extends TouchableOpacityProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'elevated' | 'outlined' | 'filled';
  onPress?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = 'elevated',
  onPress,
  ...props
}) => {
  const scaleValue = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (onPress) {
      Animated.spring(scaleValue, {
        toValue: 0.98,
        useNativeDriver: true,
      }).start();
    }
  };

  const handlePressOut = () => {
    if (onPress) {
      Animated.spring(scaleValue, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'elevated':
        return {
          backgroundColor: theme.colors.background.primary,
          ...theme.shadows.md,
        };
      case 'outlined':
        return {
          backgroundColor: theme.colors.background.primary,
          borderWidth: 1,
          borderColor: theme.colors.neutral.grey300,
        };
      case 'filled':
        return {
          backgroundColor: theme.colors.background.secondary,
        };
      default:
        return {
          backgroundColor: theme.colors.background.primary,
          ...theme.shadows.md,
        };
    }
  };

  const renderContent = () => {
    if (onPress) {
      return (
        <TouchableOpacity
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          {...(props as TouchableOpacityProps)}>
          {children}
        </TouchableOpacity>
      );
    }
    return <View {...(props as ViewProps)}>{children}</View>;
  };

  return (
    <Animated.View
      style={[
        styles.container,
        getVariantStyles(),
        style,
        {transform: [{scale: scaleValue}]},
      ]}>
      {renderContent()}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
});
