// Phase 3.3: Migrated from withLoadingModal to useModal hook
// Phase 4.5: Migrated from Redux thunk props to React Query hooks (M3 completion)
import React, { useState, useCallback, useEffect } from 'react';
import { useModal } from '../../context';
import {
  RatsMeeting,
  DaysAndTimes,
  meetingTypeItems,
} from '../../entities/Meeting';
import { FormikProps, withFormik, Field } from 'formik';
import { Alert, View, Dimensions, ViewStyle, TextStyle } from 'react-native';
import RatsScrollView from '../../components/rats-scroll-view';
import {
  SCROLL_CONTAINER,
  normalize,
  fontSize,
  color,
  CARD_STYLE,
} from '../../styles/theme';
import { renderField } from '../../util/form';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import { House } from '../../entities/House';
import { RatsText } from '../../components/rats-text';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { cloneDeep } from 'lodash';
import { getCheckinInput } from '../../util/meeting';
import { format } from 'date-fns';
import {
  militaryTimeToDate,
  getFormattedTime,
  getPickerItems,
} from '../../util/display';
import { User } from '../../entities/User';
import { WeekdayWithTime } from '../../components/weekdays';
import { Weekdays, daysOfWeek } from '../../components/weekdays';
import { Routes, RootStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/screen-header';
import ConfirmationButtons from '../../components/confirmation-buttons';
import RatsPicker from '../../components/rats-picker/rats-picker';
import HelpIcon from '../../components/help-icon';
import DayTimeWidget from './DayTimeWidget';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppSelector } from '../../state/store';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';
import {
  useAddMeeting,
  useCheckIntoMeeting,
} from '../../state/queries/meetingQueries';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

// Props consumed by the withFormik-wrapped form
interface FormProps {
  meeting?: RatsMeeting;
  addMeeting: (meeting: RatsMeeting, isGuest?: boolean) => Promise<any>;
  checkIntoMeeting: (checkInInput: any, meeting: RatsMeeting) => Promise<any>;
  house: House;
  user: User;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const NewMeeting: React.FC<Props> = ({ navigation }) => {
  const { showLoadingModal, hideLoadingModal } = useModal();

  const addMeetingMutation = useAddMeeting();
  const checkIntoMeetingMutation = useCheckIntoMeeting();
  const { house } = useSelectedHouse();
  const user = useAppSelector(state => state.user.user);
  const { guest } = useSelectedGuest();
  const userAsGuest = useAppSelector(state => state.guests.userAsGuest);

  const addingMeeting = addMeetingMutation.isPending;
  const checkingIn = checkIntoMeetingMutation.isPending;

  useEffect(() => {
    const loading = addingMeeting || checkingIn;
    const message = addingMeeting
      ? 'Adding meeting...'
      : 'Checking into meeting...';
    if (loading) {
      showLoadingModal(message);
    } else {
      hideLoadingModal();
    }
  }, [addingMeeting, checkingIn, showLoadingModal, hideLoadingModal]);

  const handleAddMeeting = useCallback(
    (meeting: RatsMeeting, isGuest?: boolean) =>
      addMeetingMutation.mutateAsync({ meeting, isGuest: isGuest ?? false }),
    [addMeetingMutation],
  );

  const handleCheckIntoMeeting = useCallback(
    (checkInInput: any, meeting: RatsMeeting) => {
      const guestId = (userAsGuest || guest)?.id ?? '';
      const houseId = house?.id ?? '';
      const userId = user?.id ?? '';
      return checkIntoMeetingMutation.mutateAsync({
        checkInInput,
        meeting,
        guestId,
        houseId,
        userId,
      });
    },
    [checkIntoMeetingMutation, userAsGuest, guest, house, user],
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader icon={<HelpIcon />} header="Create Meeting" />
      <NewMeetingForm
        navigation={navigation}
        house={house!}
        user={user!}
        addMeeting={handleAddMeeting}
        checkIntoMeeting={handleCheckIntoMeeting}
        meeting={undefined as any}
      />
    </View>
  );
};

export default NewMeeting;

const NewMeetingFormView: React.FC<
  FormikProps<RatsMeeting & { checkIn: boolean }> & {
    navigation: NativeStackNavigationProp<RootStackParamList>;
  }
> = props => {
  const { values, setFieldValue, handleSubmit, navigation } = props;

  const [show, setShow] = useState(false);
  const [sunday, setSunday] = useState(false);
  const [monday, setMonday] = useState(false);
  const [tuesday, setTuesday] = useState(false);
  const [wednesday, setWednesday] = useState(false);
  const [thursday, setThursday] = useState(false);
  const [friday, setFriday] = useState(false);
  const [saturday, setSaturday] = useState(false);
  const [selectedDay, setSelectedDay] = useState('monday');

  const dayStateMap = {
    sunday,
    monday,
    tuesday,
    wednesday,
    thursday,
    friday,
    saturday,
  };

  const daySetterMap = {
    sunday: setSunday,
    monday: setMonday,
    tuesday: setTuesday,
    wednesday: setWednesday,
    thursday: setThursday,
    friday: setFriday,
    saturday: setSaturday,
  };

  const setTime = useCallback(
    (event: any, time: any) => {
      if (event.type !== 'dismissed') {
        setShow(false);
        setFieldValue(`daysAndTimes[${selectedDay}]`, format(time, 'HH:mm'));
      } else {
        setShow(false);
        const setter = (daySetterMap as Record<string, any>)[selectedDay];
        if (setter) setter(false);
      }
    },
    [selectedDay, setFieldValue],
  );

  const showTimepicker = useCallback(() => {
    setShow(true);
  }, []);

  const getTime = useCallback(() => {
    const time = values.time;
    if (time) {
      return militaryTimeToDate(time);
    }
  }, [values.time]);

  const setCheckIn = useCallback(() => {
    setFieldValue('checkIn', !values.checkIn);
  }, [setFieldValue, values.checkIn]);

  const onWeekdayPress = useCallback(
    (currentDay: number, event: any) => {
      const day = daysOfWeek[currentDay].toLowerCase();
      const currentDayState = (dayStateMap as Record<string, boolean>)[day];
      const setter = (daySetterMap as Record<string, any>)[day];

      let showPicker = false;
      if (!currentDayState) {
        showPicker = true;
      }
      if (currentDayState) {
        setFieldValue(`daysAndTimes[${day}]`, null);
      }

      if (setter) {
        setter(!currentDayState);
      }
      setSelectedDay(day);
      setShow(showPicker);
    },
    [dayStateMap, setFieldValue],
  );

  const Weekday = useCallback(
    (day: string) => {
      const daysAndTimes = values.daysAndTimes || {};
      const time = (daysAndTimes as Record<string, string>)[day.toLowerCase()];
      const formattedTime = time
        ? getFormattedTime(militaryTimeToDate(time))
        : '';
      return (
        <WeekdayWithTime
          textStyle={{
            ...getWeekdayTextStyle(day),
            fontSize: fontSize.small,
          }}
          time={formattedTime || ''}
          day={day}
          value={time ? militaryTimeToDate(time) : new Date()}
        />
      );
    },
    [values.daysAndTimes],
  );

  const getWeekdayContainerStyle = useCallback(
    (day: string) => {
      let containerStyle: ViewStyle = {};
      if ((dayStateMap as Record<string, boolean>)[day.toLowerCase()]) {
        containerStyle.backgroundColor = color.blue;
      }
      return containerStyle;
    },
    [dayStateMap],
  );

  const getWeekdayTextStyle = useCallback(
    (day: string) => {
      let textStyle: TextStyle = {};
      if ((dayStateMap as Record<string, boolean>)[day.toLowerCase()]) {
        textStyle.color = color.white;
      }
      return textStyle;
    },
    [dayStateMap],
  );

  const renderWeekdays = useCallback(() => {
    const DAY_CONTAINER: ViewStyle = {
      width: Dimensions.get('screen').width / 5,
      height: normalize(45),
      borderColor: color.black,
      borderWidth: 1,
      borderRadius: 5,
      backgroundColor: color.white,
    };
    return (
      <View style={{ padding: normalize(10) }}>
        <RatsText
          text="Select Meeting Days and Times:"
          translate={false}
          style={{
            fontSize: fontSize.medium,
            marginBottom: normalize(10),
            color: color.dark_grey,
          }}
        />
        <View style={{ height: normalize(90) }}>
          <Weekdays
            containerStyle={DAY_CONTAINER}
            alwaysEnabled
            displayDaysToGo={false}
            onWeekdayPress={onWeekdayPress}
            customWeekdayContent={Weekday}
            getWeekdayContainerStyle={getWeekdayContainerStyle}
            getTextStyle={getWeekdayTextStyle}
          />
        </View>
      </View>
    );
  }, [onWeekdayPress, Weekday, getWeekdayContainerStyle, getWeekdayTextStyle]);

  return (
    <RatsScrollView contentContainerStyle={[SCROLL_CONTAINER]}>
      <View style={CARD_STYLE}>
        {renderField(
          'name',
          'Meeting Name',
          RatsTextInput,
          false,
          'Name',
          'string',
        )}
        <Field
          component={RatsPicker}
          name="type"
          label="Type"
          items={getPickerItems(meetingTypeItems, undefined, true)}
        />
        {renderField(
          'address',
          'Address',
          RatsTextInput,
          false,
          'Address',
          'string',
        )}
        <Field
          label="Days & Times"
          name="daysAndTimes"
          component={DayTimeWidget}
        />
      </View>
      <View
        style={{
          ...CARD_STYLE,
          marginBottom: 0,
          paddingTop: normalize(15),
          paddingBottom: normalize(15),
          marginTop: 'auto',
          shadowRadius: 50,
          shadowOffset: {
            height: 20,
            width: 10,
          },
          elevation: 10,
        }}>
        <SafeAreaView edges={['bottom']}>
          <ConfirmationButtons
            cancel={navigation.goBack}
            confirm={handleSubmit}
          />
        </SafeAreaView>
      </View>
    </RatsScrollView>
  );
};

const initialValues: any = {
  name: '',
  type: 'AA',
  checkIn: false,
  daysAndTimes: { monday: '17:00' },
};

const NewMeetingForm = withFormik<
  FormProps,
  RatsMeeting & { checkIn: boolean }
>({
  mapPropsToValues: props =>
    props.meeting
      ? props.meeting
      : {
          ...initialValues,
          street: props.house?.street,
          city: props.house?.city,
          state: props.house?.state,
          zip: props.house?.zip,
        },
  handleSubmit: async (values, formikBag) => {
    const { addMeeting, checkIntoMeeting, user, navigation } = formikBag.props;
    const newMeeting: any = cloneDeep(values);
    if (newMeeting.checkIn !== undefined) {
      delete newMeeting.checkIn;
    }
    newMeeting.addedBy = `${user.firstName} ${user.lastName}`;
    newMeeting.type = 'Custom';
    try {
      await addMeeting(newMeeting as RatsMeeting, user.isGuest);
      if (values.checkIn) {
        const checkInInput = getCheckinInput(newMeeting, null);
        if (checkInInput) {
          await checkIntoMeeting(checkInInput, newMeeting);
        }
      }
      navigation.navigate(Routes.MeetingSearch);
    } catch (error) {
      Alert.alert('Failed to add meeting.');
    }
  },
  validationSchema: null,
  //@ts-ignore
})(NewMeetingFormView);
