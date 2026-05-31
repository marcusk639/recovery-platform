// src/components/common/Input.tsx
import React, {useState} from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
  Animated,
} from 'react-native';
import {theme} from '../../theme/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  labelStyle?: TextStyle;
  errorStyle?: TextStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  containerStyle,
  inputStyle,
  labelStyle,
  errorStyle,
  leftIcon,
  rightIcon,
  onFocus,
  onBlur,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const scaleValue = React.useRef(new Animated.Value(1)).current;

  const handleFocus = (e: any) => {
    setIsFocused(true);
    Animated.spring(scaleValue, {
      toValue: 1.02,
      useNativeDriver: true,
    }).start();
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
    onBlur?.(e);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={[styles.label, labelStyle]} testID="input-label">
          {label}
        </Text>
      )}
      <Animated.View
        style={[
          styles.inputContainer,
          isFocused ? styles.focusedInput : undefined,
          error ? styles.errorInput : undefined,
          {transform: [{scale: scaleValue}]},
        ]}>
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
        <TextInput
          style={[
            styles.input,
            leftIcon ? styles.inputWithLeftIcon : undefined,
            rightIcon ? styles.inputWithRightIcon : undefined,
            inputStyle,
          ]}
          placeholderTextColor={theme.colors.neutral.grey400}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
        {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
      </Animated.View>
      {error && (
        <Text style={[styles.error, errorStyle]} testID="input-error">
          {error}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.neutral.grey700,
    marginBottom: theme.spacing.xs,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background.primary,
    borderWidth: 1,
    borderColor: theme.colors.neutral.grey300,
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  focusedInput: {
    borderColor: theme.colors.primary.main,
    ...theme.shadows.md,
  },
  errorInput: {
    borderColor: theme.colors.status.error,
  },
  input: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.neutral.grey900,
  },
  inputWithLeftIcon: {
    paddingLeft: theme.spacing.xs,
  },
  inputWithRightIcon: {
    paddingRight: theme.spacing.xs,
  },
  leftIcon: {
    paddingLeft: theme.spacing.md,
  },
  rightIcon: {
    paddingRight: theme.spacing.md,
  },
  error: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.status.error,
    marginTop: theme.spacing.xs,
  },
});
