import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

export interface RatsWizardSlideProps {
  /** Active step index (0-indexed). */
  currentStep: number;
  /** One child per step; all render, but only the active one is on-screen. */
  children: React.ReactNode[];
  testID?: string;
}

/**
 * Slide-between-steps animation for multi-step wizards. Lays out children
 * horizontally and animates a translateX based on `currentStep`.
 *
 * Uses React Native's built-in `Animated` API — no external dependency.
 *
 * @example
 * <RatsWizardSlide currentStep={step}>
 *   <StepOne />
 *   <StepTwo />
 *   <StepThree />
 * </RatsWizardSlide>
 */
const RatsWizardSlide: React.FC<RatsWizardSlideProps> = ({
  currentStep,
  children,
  testID,
}) => {
  const translateX = useRef(
    new Animated.Value(-currentStep * SCREEN_WIDTH),
  ).current;

  useEffect(() => {
    const anim = Animated.timing(translateX, {
      toValue: -currentStep * SCREEN_WIDTH,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [currentStep, translateX]);

  return (
    <View style={styles.viewport} testID={testID}>
      <Animated.View
        style={[
          styles.row,
          { width: SCREEN_WIDTH * children.length },
          { transform: [{ translateX }] },
        ]}>
        {children.map((child, i) => (
          <View key={i} testID={`wizard-slide-step-${i}`} style={styles.step}>
            {child}
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    flex: 1,
  },
  step: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
});

export default RatsWizardSlide;
