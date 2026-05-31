// src/components/common/Button.tsx
import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Animated,
  View,
} from 'react-native';
import {theme} from '../../theme/theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'text';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  textStyle,
  testID,
  fullWidth = false,
}) => {
  const scaleValue = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: theme.colors.primary.main,
          borderColor: theme.colors.primary.main,
        };
      case 'secondary':
        return {
          backgroundColor: theme.colors.secondary.main,
          borderColor: theme.colors.secondary.main,
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          borderColor: theme.colors.primary.main,
          borderWidth: 1,
        };
      case 'text':
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
        };
      default:
        return {
          backgroundColor: theme.colors.primary.main,
          borderColor: theme.colors.primary.main,
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          paddingVertical: theme.spacing.sm + 4,
          paddingHorizontal: theme.spacing.md,
          minHeight: 44,
        };
      case 'medium':
        return {
          paddingVertical: theme.spacing.sm + 6,
          paddingHorizontal: theme.spacing.lg,
          minHeight: 48,
        };
      case 'large':
        return {
          paddingVertical: theme.spacing.md + 8,
          paddingHorizontal: theme.spacing.xl,
          minHeight: 56,
        };
      default:
        return {
          paddingVertical: theme.spacing.sm + 6,
          paddingHorizontal: theme.spacing.lg,
          minHeight: 48,
        };
    }
  };

  const getTextColor = () => {
    if (disabled) return theme.colors.neutral.grey400;
    if (variant === 'outline' || variant === 'text') {
      return theme.colors.primary.main;
    }
    return theme.colors.primary.contrast;
  };

  const getFontSize = () => {
    switch (size) {
      case 'small':
        return theme.typography.fontSize.sm;
      case 'medium':
        return theme.typography.fontSize.md;
      case 'large':
        return theme.typography.fontSize.lg;
      default:
        return theme.typography.fontSize.md;
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        getVariantStyles(),
        getSizeStyles(),
        fullWidth && styles.fullWidth,
        style,
        {transform: [{scale: scaleValue}]},
      ]}>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={StyleSheet.absoluteFill}
        activeOpacity={0.8}
        testID={testID}>
        <View style={styles.touchableContent}>
          {loading ? (
            <ActivityIndicator
              color={getTextColor()}
              size={getFontSize()}
              style={styles.loading}
            />
          ) : (
            <Text
              style={[
                styles.text,
                {
                  color: getTextColor(),
                  fontSize: getFontSize(),
                },
                textStyle,
              ]}>
              {title}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  fullWidth: {
    width: '100%',
  },
  touchableContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
  loading: {
    marginVertical: 2,
  },
});
