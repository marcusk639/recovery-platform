import React from 'react';
import DateTimePicker, {
  AndroidNativeProps,
  IOSNativeProps,
} from '@react-native-community/datetimepicker';
import { IOS } from '../../util/platform';
import RatsModal from '../rats-modal';

type RatsTimePickerProps = AndroidNativeProps &
  IOSNativeProps & {
    isVisible?: boolean;
    onBackdropPress: () => void;
  };

export const RatsTimePicker = (
  props: RatsTimePickerProps & AndroidNativeProps & IOSNativeProps,
) => {
  const {
    is24Hour = false,
    display = 'default',
    onChange,
    value,
    isVisible = false,
    onBackdropPress,
  } = props;
  const Picker = () => (
    <DateTimePicker
      value={value}
      mode="time"
      is24Hour={is24Hour}
      display={display}
      onChange={onChange}
    />
  );
  if (IOS) {
    const RatsModalAny = RatsModal as any;
    return (
      <RatsModalAny
        containerStyle={{ justifyContent: 'center', alignItems: 'center' }}
        style={{ justifyContent: 'space-between', alignItems: 'center' }}
        onBackdropPress={onBackdropPress}
        isVisible={isVisible}>
        {Picker()}
      </RatsModalAny>
    );
  }
  return Picker();
};
