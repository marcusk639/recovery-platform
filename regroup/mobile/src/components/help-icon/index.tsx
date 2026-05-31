import React from 'react';
import { TouchableOpacity } from 'react-native';
import { RatsIcon } from '../rats-icon/rats-icon';
import { color } from '../../styles/theme';

interface Props {
  helpFn?: () => void;
  setRef?: (ref: any) => void;
}

const HelpIcon = ({ helpFn = () => null, setRef = ref => null }: Props) => {
  return (
    <TouchableOpacity
      onPress={helpFn}
      ref={ref => {
        if (setRef && typeof setRef === 'function') {
          setRef(ref);
        }
      }}>
      <RatsIcon
        name="question-circle"
        solid
        size={30}
        style={{ color: color.baby_blue }}
      />
    </TouchableOpacity>
  );
};

export default HelpIcon;
