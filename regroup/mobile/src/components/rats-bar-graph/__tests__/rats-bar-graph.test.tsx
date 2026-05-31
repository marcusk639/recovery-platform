/**
 * Tests for RatsBarGraph component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import RatsBarGraph from '../index';

// Mock victory-native — its native canvas/svg drawing is not available in Jest
jest.mock('victory-native', () => {
  const { View, Text } = require('react-native');
  return {
    VictoryChart: ({ children, testID }: any) => (
      <View testID={testID || 'victory-chart'}>{children}</View>
    ),
    VictoryBar: ({ data, testID }: any) => (
      <View testID={testID || 'victory-bar'}>
        {(data || []).map((d: any, i: number) => (
          <Text key={i}>{String(d.y ?? '')}</Text>
        ))}
      </View>
    ),
    VictoryAxis: ({ testID }: any) => <View testID={testID || 'victory-axis'} />,
    VictoryTheme: { material: {} },
  };
});

const sampleData = [
  { x: 'Jan', y: 10 },
  { x: 'Feb', y: 20 },
  { x: 'Mar', y: 15 },
];

const defaultBarStyles = { data: { fill: '#0094C6' } };

describe('RatsBarGraph', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <RatsBarGraph data={sampleData} barStyles={defaultBarStyles} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with an empty data array without crashing', () => {
    const { toJSON } = render(
      <RatsBarGraph data={[]} barStyles={defaultBarStyles} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders VictoryChart', () => {
    const { getByTestId } = render(
      <RatsBarGraph data={sampleData} barStyles={defaultBarStyles} />,
    );
    expect(getByTestId('victory-chart')).toBeTruthy();
  });

  it('renders VictoryBar with data points', () => {
    const { getByTestId } = render(
      <RatsBarGraph data={sampleData} barStyles={defaultBarStyles} />,
    );
    expect(getByTestId('victory-bar')).toBeTruthy();
  });

  it('renders VictoryAxis', () => {
    const { getByTestId } = render(
      <RatsBarGraph data={sampleData} barStyles={defaultBarStyles} />,
    );
    expect(getByTestId('victory-axis')).toBeTruthy();
  });

  it('renders data values inside the bar', () => {
    const { getByText } = render(
      <RatsBarGraph data={sampleData} barStyles={defaultBarStyles} />,
    );
    expect(getByText('10')).toBeTruthy();
    expect(getByText('20')).toBeTruthy();
    expect(getByText('15')).toBeTruthy();
  });

  it('accepts a custom height prop without crashing', () => {
    const { toJSON } = render(
      <RatsBarGraph data={sampleData} barStyles={defaultBarStyles} height={300} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a custom width prop without crashing', () => {
    const { toJSON } = render(
      <RatsBarGraph data={sampleData} barStyles={defaultBarStyles} width={400} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a barLabels function without crashing', () => {
    const { toJSON } = render(
      <RatsBarGraph
        data={sampleData}
        barStyles={defaultBarStyles}
        barLabels={({ datum }) => String(datum.y)}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts xAxisStyle and yAxisStyle props without crashing', () => {
    const { toJSON } = render(
      <RatsBarGraph
        data={sampleData}
        barStyles={defaultBarStyles}
        xAxisStyle={{ axis: { stroke: 'red' } }}
        yAxisStyle={{ axis: { stroke: 'blue' } }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a numeric barWidth prop without crashing', () => {
    const { toJSON } = render(
      <RatsBarGraph data={sampleData} barStyles={defaultBarStyles} barWidth={20} />,
    );
    expect(toJSON()).toBeTruthy();
  });
});
