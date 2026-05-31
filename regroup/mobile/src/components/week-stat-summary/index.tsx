import React, { PropsWithChildren } from 'react';
import { View, ViewStyle } from 'react-native';
import { RatsText } from '../rats-text';
import {
  ROW,
  normalize,
  CARD_STYLE,
  fontSize,
  color,
} from '../../styles/theme';
import { getHealthIcon } from '../rats-icon';
import { getHealthByPercentage, HEALTH_COLOR_MAP } from '../../util/guest';
import { IOS } from '../../util/platform';

interface Props {
  header: string;
  rightSideContent: JSX.Element;
  percentage: number;
  rightSideContainer?: ViewStyle;
}

const icon = (percentage: number) => {
  const health = getHealthByPercentage(percentage);
  //@ts-ignore
  return getHealthIcon(health, { size: fontSize.huge });
};

const WeekStatSummary = ({
  header,
  rightSideContent,
  percentage,
  children,
  rightSideContainer,
}: PropsWithChildren<Props>) => {
  return (
    <View
      style={[
        CARD_STYLE,
        { justifyContent: 'center', padding: normalize(15), marginBottom: 2 },
      ]}>
      <View style={[ROW, { flex: 1 }]}>
        <View style={{ flex: 0.54 }}>
          <RatsText
            text={header}
            style={{
              fontSize: fontSize.regular_medium,
              color: color.dark_grey,
            }}
          />
          <View style={{ ...ROW, alignItems: 'center' }}>
            <RatsText
              text={`${percentage}%`}
              style={{
                fontSize: fontSize.huger,
                color: HEALTH_COLOR_MAP[getHealthByPercentage(percentage)],
                fontWeight: '500' as const,
                marginRight: normalize(5),
              }}
            />
            {/* <RatsIcon name="laugh-beam" solid size={fontSize.huge + 5} style={{ color: color.green, alignSelf: 'center' }} />
             */}
            <View style={{ marginTop: IOS ? normalize(4) : normalize(10) }}>
              {icon(percentage)}
            </View>
          </View>
        </View>
        <View style={[{ flex: 0.46 }, rightSideContainer]}>
          {rightSideContent}
        </View>
      </View>
      {children}
    </View>
  );
};

export default WeekStatSummary;
