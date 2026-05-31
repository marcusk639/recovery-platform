import React from 'react';
import { View, TextStyle, ViewStyle } from 'react-native';
import DateTimePicker, {
  AndroidNativeProps,
  IOSNativeProps,
} from '@react-native-community/datetimepicker';
import { RatsText } from '../rats-text';
import { color, fontSize } from '../../styles/theme';
import { militaryTimeToDate } from '../../util/display';

interface Props {
  day: string;
  time: string;
  textStyle?: TextStyle;
  containerStyle?: ViewStyle;
}

const WeekdayWithTime = ({
  day,
  time,
  textStyle,
  containerStyle,
  onChange,
}: Props & IOSNativeProps & AndroidNativeProps) => {
  return (
    <View
      style={[
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.white,
        },
        containerStyle,
      ]}>
      <RatsText
        text={day}
        translate={false}
        style={{ fontSize: fontSize.small, ...textStyle }}
      />
      {/* <DateTimePicker themeVariant='light' style={{ backgroundColor: 'white', backfaceVisibility: 'hidden' }} value={militaryTimeToDate(time)} mode="time" is24Hour={false} display="default" onChange={onChange} /> */}
      <RatsText
        text={time}
        translate={false}
        style={{ fontSize: fontSize.small, ...textStyle }}
      />
    </View>
  );
};

export default WeekdayWithTime;
