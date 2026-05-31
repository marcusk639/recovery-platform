import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RatsText } from '../rats-text';
import { color, fontSize, normalize } from '../../styles/theme';
import { ChartConditionStatus } from '../../entities/oxford/CharterCompliance';

interface Props {
  status: ChartConditionStatus;
  testID?: string;
}

const STATUS_CONFIG: Record<
  ChartConditionStatus,
  { label: string; bg: string; text: string }
> = {
  pass: { label: 'Pass', bg: color.light_green, text: color.white },
  fail: { label: 'Fail', bg: color.red, text: color.white },
  insufficient_data: {
    label: 'No Data',
    bg: color.yellow,
    text: color.dark_blue,
  },
};

const CharterBadge: React.FC<Props> = ({ status, testID }) => {
  const config = STATUS_CONFIG[status];
  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: config.bg }]}>
      <RatsText
        text={config.label}
        style={[styles.label, { color: config.text }]}
        translate={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 4,
    paddingHorizontal: normalize(8),
    paddingVertical: normalize(3),
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: fontSize.extraSmall,
    fontWeight: '700',
  },
});

export default CharterBadge;
