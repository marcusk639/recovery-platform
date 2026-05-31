import React from 'react';
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryTheme,
} from 'victory-native';
import { Dimensions } from 'react-native';

interface Props {
  data: any[];
  barStyles: any;
  chartContainerStyles?: any;
  height?: number;
  width?: number;
  xAxisStyle?: any;
  yAxisStyle?: any;
  barWidth?: number | Function;
  barLabels?: (params: any) => string;
}

const RatsBarGraph = (props: Props) => {
  const {
    data,
    barStyles,
    height,
    width,
    xAxisStyle,
    yAxisStyle,
    barLabels,
    barWidth,
  } = props;
  const p = 35;
  return (
    <VictoryChart
      padding={{ top: 30, bottom: p, left: p, right: p }}
      theme={VictoryTheme.material}
      height={height || Dimensions.get('screen').height / 3}
      width={width || Dimensions.get('screen').width}>
      <VictoryAxis style={xAxisStyle || {}} />
      {/* <VictoryAxis dependentAxis style={yAxisStyle || {}} /> */}
      <VictoryBar
        cornerRadius={5}
        barWidth={barWidth as any}
        labels={barLabels}
        style={barStyles}
        data={data}
      />
    </VictoryChart>
  );
};

export default RatsBarGraph;
