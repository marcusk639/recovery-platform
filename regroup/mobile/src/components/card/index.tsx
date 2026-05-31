import React from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TouchableOpacityProps,
} from 'react-native';
import { normalize, elevateStyle, color } from '../../styles/theme';

interface CardProps extends TouchableOpacityProps {
  containerStyle?: ViewStyle;
  children: React.ReactNode;
  activeOpacity?: number;
}

const cardStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: normalize(10),
    backgroundColor: color.white,
    //  alignItems: 'center',
    //  justifyContent: 'center',
    ...elevateStyle,
  },
});

const Card = (props: CardProps) => {
  const { containerStyle, children } = props;
  return (
    <TouchableOpacity {...props} style={[cardStyles.container, containerStyle]}>
      {children}
    </TouchableOpacity>
  );
};

export default Card;
