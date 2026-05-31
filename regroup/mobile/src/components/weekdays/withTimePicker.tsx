import React, { Component } from 'react';
import { View, GestureResponderEvent } from 'react-native';
import { RatsTimePicker } from '../rats-datepicker/rats-timepicker';
import { DateTimePickerEvent } from '@react-native-community/datetimepicker';

class State {
  show: boolean = false;
  selectedDay: number = 0;
  time: Date = new Date();
}

export const withTimePicker = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  setDayTime: (day: number, time: Date) => void,
) => {
  return class extends Component<P, State> {
    constructor(props: P) {
      super(props);
      this.state = new State();
    }

    show = (currentDay: number) => {
      this.setState({
        show: true,
        selectedDay: currentDay,
        time: new Date(),
      });
    };

    onWeekdayPress = (currentDay: number, event: GestureResponderEvent) => {
      this.show(currentDay);
    };

    setTime = (event: DateTimePickerEvent, date?: Date) => {
      if (date) {
        setDayTime(this.state.selectedDay, date);
      }
    };

    hideTimePicker = () => {
      this.setState({ show: false });
    };

    render() {
      const { show, time } = this.state;
      return (
        <View>
          <WrappedComponent {...(this.props as P)} />
          {show && (
            <RatsTimePicker
              onChange={this.setTime}
              value={time}
              onBackdropPress={this.hideTimePicker}
            />
          )}
        </View>
      );
    }
  };
};
