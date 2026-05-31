import { TouchableOpacity, View } from 'react-native';
import React, { Component } from 'react';
import Icon from 'react-native-vector-icons/Ionicons';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import settings from '../../settings/time';

import RatsTextInput from '../rats-text-input/rats-text-input';

/** Map legacy moment format tokens to date-fns tokens */
const DATE_FORMAT = settings.dateFormat
  .replace('YYYY', 'yyyy')
  .replace('DD', 'dd');
import { normalize, fontSize } from '../../styles/theme';
import { FieldProps } from 'formik';
import { momentToDate, getTodaysDate } from '../../util/display';
import DatePicker from 'react-native-date-picker';

interface Props {
  labelColor?: string;
}

class State {
  open: boolean = false;
}

class RatsDatePicker extends Component<Props & FieldProps, State> {
  state = new State();

  constructor(props: Props & FieldProps) {
    super(props);
    this.setDate = this.setDate.bind(this);
    this.getTodaysDate = this.getTodaysDate.bind(this);
  }

  setOpen = (open: boolean) => this.setState({ open });

  getTodaysDate(): Date {
    const currentTime = new Date();
    const convertTime = formatInTimeZone(
      currentTime,
      settings.timezone,
      `${DATE_FORMAT} HH:mm:ss`,
    );
    return new Date(convertTime);
  }

  setDate(newDate: Date) {
    const {
      field: { name },
      form: { setFieldValue },
    } = this.props;
    setFieldValue(name, format(newDate, DATE_FORMAT));
  }

  render() {
    const {
      field: { name, value, onChange, onBlur },
      form,
      labelColor,
    } = this.props;

    return (
      <View>
        <DatePicker
          modal
          mode="date"
          open={this.state.open}
          date={value ? momentToDate(value) : momentToDate(getTodaysDate())}
          onConfirm={date => {
            this.setOpen(false);
            this.setDate(date);
          }}
          onCancel={() => {
            this.setOpen(false);
          }}
        />
        <TouchableOpacity onPress={() => this.setOpen(true)}>
          <View pointerEvents="none">
            <RatsTextInput
              placeholder={value ? undefined : format(new Date(), DATE_FORMAT)}
              styleType="secondary"
              field={{
                name,
                value,
                onChange,
                onBlur,
              }}
              labelColor={labelColor}
              form={form}
              icon={
                <Icon
                  name="ios-calendar"
                  style={{ paddingLeft: normalize(10) }}
                  size={fontSize.large}
                  color="rgb(49, 49, 49)"
                />
              }
            />
          </View>
        </TouchableOpacity>
      </View>
    );
  }
}

export default RatsDatePicker;
