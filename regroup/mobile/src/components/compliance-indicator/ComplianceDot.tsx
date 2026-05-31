/**
 * ComplianceDot
 *
 * A small colored dot that shows a guest's compliance status at a glance.
 * Intended for use in list rows — keeps the visual footprint minimal.
 *
 * Status colors:
 *   compliant       → green  (#009A39)
 *   non-compliant   → red    (#bb0000)
 *   loading         → medium grey (pulsing opacity is intentionally skipped to
 *                     keep the implementation dependency-free)
 *   incomplete-data → dark grey  (no summary yet / phase not configured)
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { color, normalize } from '../../styles/theme';

export type ComplianceStatus = 'compliant' | 'non-compliant' | 'incomplete-data' | 'loading';

interface ComplianceDotProps {
  status: ComplianceStatus;
  /** Diameter of the dot in logical pixels before scaling. Defaults to 10. */
  size?: number;
  testID?: string;
}

const STATUS_COLOR: Record<ComplianceStatus, string> = {
  compliant: color.green,
  'non-compliant': color.red,
  loading: color.medium_grey,
  'incomplete-data': color.dark_grey,
};

const ComplianceDot: React.FC<ComplianceDotProps> = ({ status, size = 10, testID }) => {
  const diameter = normalize(size);
  return (
    <View
      testID={testID || `compliance-dot-${status}`}
      style={[
        styles.dot,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: STATUS_COLOR[status],
        },
      ]}
    />
  );
};

const styles = StyleSheet.create({
  dot: {
    alignSelf: 'center',
    marginLeft: normalize(6),
  },
});

export default ComplianceDot;
