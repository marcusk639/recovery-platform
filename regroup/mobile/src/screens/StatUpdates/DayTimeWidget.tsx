import { TouchableOpacity, View, Platform, Text } from 'react-native';
import React, { useState, useCallback, Fragment } from 'react';
import Icon from 'react-native-vector-icons/Ionicons';
import settings from '../../settings/time';
import { FieldProps, Field } from 'formik';
import { DaysAndTimes } from '../../entities/Meeting';
import { ROW, color, fontSize, normalize } from '../../styles/theme';
import {
  getPickerItems,
  camelCaseToDisplayForm,
  militaryTimeToDate,
  militaryTimeToFormatted,
  getMilitaryTime,
} from '../../util/display';
import RatsPicker from '../../components/rats-picker/rats-picker';
import { daysOfWeek } from '../../components/weekdays';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import { RatsText } from '../../components/rats-text';
import { format } from 'date-fns';
import { RatsTimePicker } from '../../components/rats-datepicker/rats-timepicker';
import TextInputStyles from '../../components/rats-text-input/styles';
import { RatsIcon } from '../../components/rats-icon';
import { ARROW_BUTTON } from '../../components/rats-numeric-input';
import { IOS } from '../../util/platform';
const inputStyles = TextInputStyles.secondary;

interface Props {
  label: string;
}

const days: Record<string, string> = {};

daysOfWeek.forEach(d => {
  const day = camelCaseToDisplayForm(d);
  days[day] = d;
});

const DayTimeWidget: React.FC<Props & FieldProps> = props => {
  const { label, field, form } = props;
  const { setFieldValue, values } = form;
  const { name, value } = field;

  const [show, setShow] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>('');

  const getTime = useCallback(() => {
    const time = value[selectedDay];
    if (time) {
      return militaryTimeToDate(time);
    }
  }, [value, selectedDay]);

  const setShowState = useCallback(
    (showState: boolean) => () => {
      setShow(showState);
    },
    [],
  );

  const setTime = useCallback(
    (event: any, time?: Date) => {
      if (IOS) {
        if (time) {
          setFieldValue(name, {
            ...value,
            [selectedDay]: format(time, 'HH:mm'),
          });
        }
      } else {
        if (event.type !== 'dismissed' && time) {
          setShow(false);
          setFieldValue(name, {
            ...value,
            [selectedDay]: format(time, 'HH:mm'),
          });
        } else {
          setShow(false);
        }
      }
    },
    [name, value, selectedDay, setFieldValue],
  );

  const addNewDayAndTime = useCallback(() => {
    for (let i = 0; i < daysOfWeek.length; i++) {
      const day = daysOfWeek[i];
      if (!value[day]) {
        setFieldValue(name, { ...value, [day]: getMilitaryTime(17, 0) });
        break;
      }
    }
  }, [value, name, setFieldValue]);

  const getDays = useCallback(
    (dayToRender: string) => {
      const _days: Record<string, string> = {};
      for (let i = 0; i < daysOfWeek.length; i++) {
        const day = daysOfWeek[i];
        if (day === dayToRender || !value[day]) {
          _days[camelCaseToDisplayForm(day)] = day;
        }
      }
      return _days;
    },
    [value],
  );

  return (
    <View style={{ marginVertical: normalize(10) }}>
      <RatsText
        text={label}
        translate={false}
        style={{
          color: color.dark_grey,
          fontSize: fontSize.medium,
          marginBottom: normalize(5),
        }}
      />
      {Object.keys(value).map(day => {
        if (value[day]) {
          return (
            <View
              key={day}
              style={[
                ROW,
                {
                  justifyContent: 'space-between',
                  marginBottom: normalize(10),
                },
              ]}>
              <RatsPicker
                field={{ name: 'day', value: day }}
                form={{ errors: {}, touched: {}, setFieldValue }}
                containerStyle={{ width: '50%', margin: 0 }}
                labelDisabled
                pickerItems={getDays(day)}
                getPickerItems={(items: Record<string, string>) =>
                  getPickerItems(items, undefined, true)
                }
                handleValueChange={val =>
                  setFieldValue(name, {
                    ...value,
                    [val]: format(new Date(), 'HH:mm'),
                    [day]: undefined,
                  })
                }
              />
              <TouchableOpacity
                style={[
                  inputStyles.inputView,
                  inputStyles.input,
                  {
                    width: '35%',
                    height: IOS ? normalize(42) : undefined,
                    justifyContent: 'space-between',
                    alignItems: IOS ? 'flex-start' : 'center',
                    paddingBottom: IOS ? undefined : normalize(2),
                  },
                ]}
                onPress={() => {
                  setSelectedDay(day);
                  setShow(true);
                }}>
                <RatsText
                  translate={false}
                  text={militaryTimeToFormatted(value[day])}
                  style={{ fontSize: fontSize.medium }}
                />
                <Icon
                  name="md-arrow-down"
                  size={normalize(24)}
                  style={{
                    color: color.dark_grey,
                    position: 'absolute',
                    top: IOS ? 10 : 10,
                    right: 10,
                  }}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  ARROW_BUTTON,
                  {
                    borderColor: color.red,
                    height: IOS ? normalize(42) : normalize(44),
                  },
                ]}
                onPress={() => {
                  setSelectedDay('');
                  setShow(false);
                  setFieldValue(name, { ...value, [day]: undefined });
                }}>
                <RatsIcon name="times" style={{ color: color.red }} size={30} />
              </TouchableOpacity>
            </View>
          );
        }
      })}
      <TouchableOpacity onPress={addNewDayAndTime}>
        <View
          style={{
            borderBottomColor: color.dark_baby_blue,
            borderBottomWidth: 2,
            marginVertical: 10,
            alignSelf: 'flex-start',
          }}>
          <RatsText
            style={{
              fontSize: fontSize.regular_medium,
              fontWeight: '700' as const,
              color: color.dark_baby_blue,
            }}
            text="ADD ANOTHER DAY AND TIME"
            translate={false}
          />
        </View>
      </TouchableOpacity>
      {IOS && show && (
        <RatsTimePicker
          onBackdropPress={() => setShow(false)}
          isVisible={show}
          onChange={setTime}
          value={getTime() || new Date()}
        />
      )}
      {show && (
        <RatsTimePicker
          display="spinner"
          onBackdropPress={setShowState(false)}
          onChange={setTime}
          value={getTime() || new Date()}
        />
      )}
    </View>
  );
};

export default DayTimeWidget;
