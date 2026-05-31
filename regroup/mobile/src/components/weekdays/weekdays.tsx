import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  TouchableOpacityProps,
  GestureResponderEvent,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { RatsText } from '../rats-text';
import { color, fontFamily, fontSize } from '../../styles/theme';
import weekdayStyles from './styles';
import { getDayOfWeek, getTodaysDate } from '../../util/display';
import { useTheme } from '../../context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { withRats, HOCProps } from '../rats-hoc';

interface WeekdaysProps {
  onWeekdayPress?: (currentDay: number, event: GestureResponderEvent) => void;
  customWeekdayContent?: (day: string) => JSX.Element;
  displayDaysToGo?: boolean;
  alwaysEnabled?: boolean;
  containerStyle?: ViewStyle;
  weekBackgroundColor?: string;
  customWeekdayContainer?: (day: string) => JSX.Element;
  getWeekdayContainerStyle?: (day: string) => ViewStyle;
  getTextStyle?: (day: string) => TextStyle;
}

export const daysOfWeek = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const getWeekdays = (
  props: Partial<WeekdaysProps> & { onWeekdayPress: (currentDay: number, event: GestureResponderEvent) => void },
  weekdayActive: (weekday: string) => boolean,
): JSX.Element[] => {
  return daysOfWeek.map((weekday, index) => (
    <Weekday
      {...props}
      selected={weekdayActive(index.toString())}
      onWeekdayPress={props.onWeekdayPress}
      key={index}
      day={weekday}
      customContent={
        props.customWeekdayContent && props.customWeekdayContent(weekday)
      }
      getContainerStyle={props.getWeekdayContainerStyle}
      getTextStyle={props.getTextStyle}
    />
  ));
};

class WeekdayState {
  '0' = false;
  '1' = false;
  '2' = false;
  '3' = false;
  '4' = false;
  '5' = false;
  '6' = false;
}

const Weekdays = (props: WeekdaysProps) => {
  const { displayDaysToGo = true, weekBackgroundColor } = props;
  // initialize state
  const [weekdayActive, setWeekdayActive] = useState<WeekdayState>(
    new WeekdayState(),
  );
  // callback method to set the Weekday as the selected day
  const onWeekdayPress = (dayNumber: number, event: GestureResponderEvent) => {
    setWeekdayActive({ ...new WeekdayState(), [dayNumber.toString()]: true });
    if (props.onWeekdayPress) {
      props.onWeekdayPress(dayNumber, event);
    }
  };
  // call back to determine if the Weekday is selected
  const isWeekdayActive = (weekday: string) =>
    (weekdayActive as unknown as Record<string, boolean>)[weekday];
  return (
    <View
      style={[
        weekdayStyles.weekdaysContainer,
        { backgroundColor: weekBackgroundColor },
      ]}>
      <View style={weekdayStyles.weekdays}>
        {getWeekdays({ ...props, onWeekdayPress }, isWeekdayActive)}
      </View>
      {displayDaysToGo && (
        <RatsText
          style={weekdayStyles.weekdaysDescription}
          translateParams={{ daysLeft: 7 - getDayOfWeek(getTodaysDate()) }}
          text="house.overview.weekdays.description"
        />
      )}
    </View>
  );
};

type TouchableOpacityWithHOC = TouchableOpacityProps & HOCProps;

interface WeekdayProps extends TouchableOpacityWithHOC {
  day: string;
  selected?: boolean;
  customContent?: JSX.Element;
  containerStyle?: ViewStyle;
  onWeekdayPress: (currentDay: number, event: GestureResponderEvent) => void;
  alwaysEnabled?: boolean;
  getContainerStyle?: (day: string) => ViewStyle;
  getTextStyle?: (day: string) => TextStyle;
}

const Weekday = (props: WeekdayProps) => {
  const {
    day,
    selected = false,
    customContent,
    alwaysEnabled = false,
    theme,
  } = props;
  const currentDay = getDayOfWeek(getTodaysDate());
  const dayNumber = daysOfWeek.indexOf(day);
  let containerStyle: ViewStyle = weekdayStyles.futureDay;
  let textColor: string = color.grey;

  if (dayNumber < currentDay) {
    containerStyle = weekdayStyles.pastDay;
    textColor = color.white;
  }
  if (dayNumber === currentDay) {
    weekdayStyles.presentDay.borderColor = theme.primaryColor;
    containerStyle = weekdayStyles.presentDay;
    textColor = theme.primaryColor;
  }
  if (dayNumber > currentDay) {
    containerStyle = weekdayStyles.futureDay;
    textColor = color.grey;
  }
  if (selected) {
    containerStyle = weekdayStyles.activeDay;
    containerStyle.backgroundColor = theme.primaryColor;
    textColor = color.white;
  }
  const onPress = (event: GestureResponderEvent) => {
    props.onWeekdayPress(dayNumber, event);
  };
  return (
    <TouchableOpacity
      disabled={!alwaysEnabled && dayNumber > currentDay}
      {...props}
      onPress={onPress}
      style={[
        containerStyle,
        props.containerStyle,
        props.getContainerStyle ? props.getContainerStyle(day) : {},
      ]}>
      {!customContent && (
        <RatsText
          style={[
            {
              color: textColor,
              fontFamily: fontFamily.bold,
              fontSize: fontSize.regular,
            },
            props.getTextStyle ? props.getTextStyle(day) : {},
          ]}
          translate={false}
          text={day.charAt(0)}
        />
      )}
      {customContent}
    </TouchableOpacity>
  );
};

export default withRats(Weekdays);
