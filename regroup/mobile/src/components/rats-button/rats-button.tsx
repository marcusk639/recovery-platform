import React from 'react';
import styles from './styles';
import { color } from '../../styles/theme';
import { ButtonProps, TouchableOpacity } from 'react-native';
import { RatsText } from '../rats-text';

interface Props {
  style?: any;
  containerStyle?: any;
  title?: string;
  light?: boolean;
  onPress?: (e: any) => any;
  disabled?: boolean;
}

export type RatsButtonProps = Props & ButtonProps;

const RatsButton = (props: RatsButtonProps) => (
  <TouchableOpacity
    {...props}
    style={[
      styles.buttonContainer,
      {
        backgroundColor: props.light ? color.white : color.baby_blue,
        borderColor: color.baby_blue,
      },
      { opacity: props.disabled ? 0.5 : 1.0 },
      props.containerStyle,
    ]}>
    <RatsText
      style={[
        styles.button,
        { color: props.light ? color.baby_blue : color.white },
        props.style,
      ]}
      toUpper={true}
      text={props.title}
    />
  </TouchableOpacity>
);

export default RatsButton;
