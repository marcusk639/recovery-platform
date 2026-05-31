import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

interface MeetingTypeSelectorProps {
  selectedFormat: string;
  onSelectFormat: (format: string) => void;
}

const MeetingTypeSelector: React.FC<MeetingTypeSelectorProps> = ({
  selectedFormat,
  onSelectFormat,
}) => {
  const meetingFormats = [
    'Open Discussion',
    'Closed Discussion',
    'Big Book Study',
    'Step Study',
    'Speaker Meeting',
    'Beginners Meeting',
    'Meditation',
    "Women's Meeting",
    "Men's Meeting",
    'LGBTQ+ Meeting',
    "Young People's Meeting",
    'Other',
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Meeting Format</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.formatScrollView}
        contentContainerStyle={styles.formatsContainer}>
        {meetingFormats.map(format => (
          <TouchableOpacity
            key={format}
            style={[
              styles.formatButton,
              selectedFormat === format && styles.selectedFormatButton,
            ]}
            onPress={() => onSelectFormat(format)}>
            <Text
              style={[
                styles.formatText,
                selectedFormat === format && styles.selectedFormatText,
              ]}>
              {format}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#424242',
    marginBottom: 12,
  },
  formatScrollView: {
    marginBottom: 8,
  },
  formatsContainer: {
    paddingRight: 16,
  },
  formatButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 8,
    marginBottom: 8,
  },
  selectedFormatButton: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  formatText: {
    fontSize: 14,
    color: '#757575',
  },
  selectedFormatText: {
    color: '#2196F3',
    fontWeight: '600',
  },
});

export default MeetingTypeSelector;
