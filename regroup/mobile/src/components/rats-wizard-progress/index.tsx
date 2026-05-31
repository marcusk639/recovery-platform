import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RatsText } from '../rats-text';
import { color, fontSize, fontFamily, normalize } from '../../styles/theme';

export interface RatsWizardProgressProps {
  /** Total number of steps in the wizard. */
  stepCount: number;
  /** Active step index (0-indexed). */
  currentStep: number;
  /** Optional label for the current step (e.g. "Officers"). */
  currentLabel?: string;
  testID?: string;
}

/**
 * Hybrid step indicator: compact dot row + "Step N of M · <label>" caption.
 * Scales to any step count; takes minimal vertical space.
 *
 * @example
 * <RatsWizardProgress
 *   stepCount={5}
 *   currentStep={1}
 *   currentLabel="Officers"
 * />
 */
const RatsWizardProgress: React.FC<RatsWizardProgressProps> = ({
  stepCount,
  currentStep,
  currentLabel,
  testID,
}) => {
  const captionText = currentLabel
    ? `Step ${currentStep + 1} of ${stepCount} · ${currentLabel}`
    : `Step ${currentStep + 1} of ${stepCount}`;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.dotRow}>
        {Array.from({ length: stepCount }).map((_, i) => {
          const isActive = i <= currentStep;
          return (
            <View
              key={i}
              testID={`wizard-progress-dot-${i}`}
              accessibilityState={{ selected: isActive }}
              style={[styles.dot, isActive && styles.dotActive]}
            />
          );
        })}
      </View>
      <RatsText text={captionText} style={styles.caption} translate={false} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: normalize(12),
    gap: normalize(6),
  },
  dotRow: {
    flexDirection: 'row',
    gap: normalize(8),
  },
  dot: {
    width: normalize(8),
    height: normalize(8),
    borderRadius: normalize(4),
    backgroundColor: color.medium_grey,
  },
  dotActive: {
    backgroundColor: color.main,
  },
  caption: {
    fontSize: fontSize.small,
    fontFamily: fontFamily.roboto,
    color: color.dark_grey,
  },
});

export default RatsWizardProgress;
