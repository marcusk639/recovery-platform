import { View, ActivityIndicator } from 'react-native';
import React from 'react';
import styles from './styles';
import { useTheme } from '../../context';

interface Props {
  color?: string;
  containerStyle?: any;
  size?: number | 'small' | 'large';
  testID?: string;
}

const RatsLoadingIndicator = ({
  containerStyle,
  color,
  size,
  testID,
}: Props) => {
  const { theme } = useTheme();

  return (
    <View
      testID={testID}
      style={[styles.activityIndicatorContainer, containerStyle]}>
      <ActivityIndicator
        animating
        size={size || 'large'}
        color={color || theme.primaryColor}
      />
    </View>
  );
};

export default RatsLoadingIndicator;
