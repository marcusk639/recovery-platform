import React, { useState, useEffect } from 'react';
import {
  View,
  Dimensions,
  ViewStyle,
  TouchableOpacity,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { RatsIcon } from '../rats-icon';
import { RatsText } from '../rats-text';
import { CARD_STYLE, ROW, color, normalize } from '../../styles/theme';
import { map, size } from 'lodash';

// Define a type for the pressable state
type PressableStateType = {
  pressed: boolean;
};

interface RatsStepIndicatorProps {
  currentPosition?: number;
  stepCount?: number;
  labels?: {
    label: string;
    icon: string;
  }[];
  onPress?: (position: number) => void;
}

const RatsSetupStepIndicator = (props: RatsStepIndicatorProps) => {
  const { currentPosition = 0, labels = [] } = props;
  // Use the hook for dimensions instead of the synchronous API
  const { width } = useWindowDimensions();

  const getColor = (index: number) => {
    if (index === currentPosition) {
      return color.baby_blue;
    }
    if (index < currentPosition) {
      return color.green;
    }
    return color.dark_grey;
  };

  const CONTAINER: ViewStyle = {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: normalize(10),
    width: width / size(labels),
    borderBottomColor: color.baby_blue,
    borderBottomWidth: 3,
  };

  const getContainer = (
    index: number,
    state: PressableStateType,
  ): ViewStyle => {
    if (state.pressed) {
      return {
        ...CONTAINER,
        opacity: 0.2,
        borderBottomWidth: currentPosition === index ? 2 : 0,
      };
    }
    return {
      ...CONTAINER,
      opacity: 1,
      borderBottomWidth: currentPosition === index ? 2 : 0,
    };
  };

  const renderSteps = () => {
    return map(labels, (label, index) => {
      return (
        <Pressable
          style={state => getContainer(index, state)}
          key={`${label.label}-${index}`}
          onPress={() => (props.onPress ? props.onPress(index) : null)}>
          <RatsIcon
            name={index < currentPosition ? 'check' : label.icon}
            size={30}
            style={{ color: getColor(index) }}
          />
          <RatsText text={label.label} style={{ color: getColor(index) }} />
        </Pressable>
      );
    });
  };

  return (
    <View style={[CARD_STYLE, ROW, { marginBottom: 1, padding: 0 }]}>
      {renderSteps()}
    </View>
  );
};

export default RatsSetupStepIndicator;
