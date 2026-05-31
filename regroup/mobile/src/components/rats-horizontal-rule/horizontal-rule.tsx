import React from 'react';
import { View } from 'react-native';
import styles from './styles';

interface Props {
  style?: any;
}

/**
 * Standard Horizontal Rule
 */
const RatsHR = ({ style }: Props) => (
  <View style={[styles.horizontalRule, style]} />
);

export default RatsHR;
