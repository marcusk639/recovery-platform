import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import upperFirst from 'lodash/upperFirst';
import {DAYS_OF_WEEK} from '../../types/utils';
interface DayPickerProps {
  selectedDay: string;
  onSelectDay: (day: string) => void;
}

const DayPicker: React.FC<DayPickerProps> = ({selectedDay, onSelectDay}) => {
  const days = DAYS_OF_WEEK.map(day => day.toLowerCase());

  return (
    <View style={styles.container}>
      {days.map(day => (
        <TouchableOpacity
          key={day}
          style={[
            styles.dayButton,
            selectedDay === day && styles.selectedDayButton,
          ]}
          onPress={() => onSelectDay(day)}>
          <Text
            style={[
              styles.dayText,
              selectedDay === day && styles.selectedDayText,
            ]}>
            {upperFirst(day.substring(0, 3))}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  dayButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 8,
    marginBottom: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  selectedDayButton: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  dayText: {
    fontSize: 14,
    color: '#757575',
  },
  selectedDayText: {
    color: '#2196F3',
    fontWeight: '600',
  },
});

export default DayPicker;
