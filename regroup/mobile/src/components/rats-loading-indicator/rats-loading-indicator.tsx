import { View, ActivityIndicator } from 'react-native';
import React from 'react';
import styles from './styles';
import { useTheme } from '../../context';

interface Props {
  color?: string;
  containerStyle?: any;
  size?: number | 'small' | 'large';
}

const RatsLoadingIndicator = ({
  containerStyle,
  color,
  size,
}: Props) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.activityIndicatorContainer, containerStyle]}>
      <ActivityIndicator
        animating
        size={size || 'large'}
        color={color || theme.primaryColor}
      />
    </View>
  );
};

export default RatsLoadingIndicator;
