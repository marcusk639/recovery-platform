/**
 * usePhaseForm - Custom hook for phase form management logic
 *
 * Phase 4.1: Extracted from PhaseConfigForm.tsx
 * Contains form state, validation, and rule toggle handlers
 */
import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import {
  getFormattedTime,
  militaryTimeToDate,
  camelCaseToDisplayForm,
} from '../../../../util/display';
import { daysOfWeek } from '../../../../components/weekdays';
import { PhaseConfiguration } from '../../../../entities/Phase';

interface UsePhaseFormProps {
  values: PhaseConfiguration;
  setFieldValue: (field: string, value: any) => void;
  handleSubmit: () => void;
  dismissModal: () => void;
  setPopover: (visible: boolean, heading: string, content: string) => void;
}

export const usePhaseForm = ({
  values,
  setFieldValue,
  handleSubmit,
  dismissModal,
  setPopover,
}: UsePhaseFormProps) => {
  // State management
  const [show, setShow] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);

  // Help popover
  const renderHelp = useCallback(() => {
    setPopover(
      true,
      'PHASE SETUP',
      'Here you can make changes to the rules and requirements for this phase.',
    );
  }, [setPopover]);

  // Day selection helpers
  const getSelectedDay = useCallback(() => {
    return (
      selectedDay !== null &&
      selectedDay !== undefined &&
      daysOfWeek[selectedDay].toLowerCase()
    );
  }, [selectedDay]);

  // Time picker management
  const dismissTimepicker = useCallback(() => {
    setShow(false);
  }, []);

  const setTime = useCallback(
    (date: Date) => {
      const day = getSelectedDay();
      setShow(false);
      setFieldValue(`rules.curfew.times[${day}]`, format(date, 'HH:mm'));
    },
    [getSelectedDay, setFieldValue],
  );

  const onWeekdayPress = useCallback((currentDay: number, event: any) => {
    setSelectedDay(currentDay);
    setShow(true);
  }, []);

  const getTime = useCallback(() => {
    const day = getSelectedDay();
    if (!day || !values.rules.curfew?.times) {
      return new Date();
    }
    const time = (values.rules.curfew.times as Record<string, string>)[
      day.toLowerCase()
    ];
    return militaryTimeToDate(time);
  }, [getSelectedDay, values]);

  // Weekday component helper
  const Weekday = useCallback(
    (day: string) => {
      const times = values.rules.curfew?.times;
      const timeString = times
        ? (times as Record<string, string>)[day.toLowerCase()]
        : '';
      const formattedTime = getFormattedTime(
        militaryTimeToDate(timeString || '22:00'),
      );
      return {
        time: formattedTime,
        day: camelCaseToDisplayForm(day),
      };
    },
    [values],
  );

  // Rule toggle handlers
  const onHasCurfewChange = useCallback(
    (value: boolean) => {
      setFieldValue('rules.curfew.required', value);
    },
    [setFieldValue],
  );

  const onOvernightChange = useCallback(
    (value: boolean) => {
      setFieldValue('rules.nightsOutAllowed', value ? 1 : 0);
    },
    [setFieldValue],
  );

  const onChoresChange = useCallback(
    (value: boolean) => {
      setFieldValue('rules.chore', value);
    },
    [setFieldValue],
  );

  const onRequiresMeetingsChange = useCallback(
    (value: boolean) => {
      setFieldValue('rules.meetings', value ? 1 : 0);
    },
    [setFieldValue],
  );

  const onRequiresWorkChange = useCallback(
    (value: boolean) => {
      setFieldValue('rules.work', value ? 20 : 0);
    },
    [setFieldValue],
  );

  const onRequiresSponsorChange = useCallback(
    (value: boolean) => {
      setFieldValue('rules.supporter', value);
    },
    [setFieldValue],
  );

  // Submit handler
  const handleSubmitClick = useCallback(() => {
    handleSubmit();
  }, [handleSubmit]);

  return {
    // State
    show,
    selectedDay,

    // Actions
    setShow,
    renderHelp,
    getSelectedDay,
    dismissTimepicker,
    setTime,
    onWeekdayPress,
    Weekday,
    getTime,
    onHasCurfewChange,
    onOvernightChange,
    onChoresChange,
    onRequiresMeetingsChange,
    onRequiresWorkChange,
    onRequiresSponsorChange,
    handleSubmitClick,
  };
};
