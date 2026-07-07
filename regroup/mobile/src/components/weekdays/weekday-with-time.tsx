import React from "react";
import { View, TextStyle, ViewStyle } from "react-native";
import { RatsText } from "../rats-text";
import { color, fontSize } from "../../styles/theme";

interface Props {
  day: string;
  time: string;
  textStyle?: TextStyle;
  containerStyle?: ViewStyle;
}

// Hardened 2026-07-05: this used to embed its own commented-out
// DateTimePicker (dead — a plain object like `imageStyles` in RatsImage,
// this was a fully inert `{/* ... */}` block) plus an unused `onChange`
// prop threaded through IOSNativeProps/AndroidNativeProps. Verified both
// real callers (PhaseConfigForm.tsx, NewMeeting.tsx) only ever use this as
// a read-only "day: time" display chip inside a tappable weekday cell whose
// press opens an entirely separate, already-working time picker
// (PhaseConfigForm's react-native-date-picker modal; NewMeeting's live UI
// is actually DayTimeWidget, not this chip at all) — so there was no live
// picker for this component to actually own. Removed the dead code rather
// than wiring up a picker nothing calls.
const WeekdayWithTime = ({ day, time, textStyle, containerStyle }: Props) => {
  return (
    <View
      style={[
        {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: color.white,
        },
        containerStyle,
      ]}
    >
      <RatsText
        text={day}
        translate={false}
        style={{ fontSize: fontSize.small, ...textStyle }}
      />
      <RatsText
        text={time}
        translate={false}
        style={{ fontSize: fontSize.small, ...textStyle }}
      />
    </View>
  );
};

export default WeekdayWithTime;
