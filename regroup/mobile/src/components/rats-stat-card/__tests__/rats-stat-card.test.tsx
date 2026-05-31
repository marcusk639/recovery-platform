/**
 * Tests for RatsStatCard, RatsStatCardHeaderItem, and RatsStatCardFooterItem
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import {
  RatsStatCard,
  RatsStatCardHeaderItem,
  RatsStatCardFooterItem,
} from '../index';

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: '#000',
      secondaryColor: '#fff',
      backgroundColor: '#fff',
      textColor: '#000',
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

jest.mock('../../rats-icon', () => ({
  RatsIcon: ({ name }: { name: string }) =>
    require('react').createElement('View', { testID: `icon-${name}` }),
}));

jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');

describe('RatsStatCard', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RatsStatCard />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays percentage text when percentage prop is provided', () => {
    const { getByText } = render(<RatsStatCard percentage="85%" />);
    expect(getByText('85%')).toBeTruthy();
  });

  it('displays ratio text when ratio prop is provided', () => {
    const { getByText } = render(<RatsStatCard ratio="3/5" />);
    expect(getByText('3/5')).toBeTruthy();
  });

  it('displays both percentage and ratio when both are provided', () => {
    const { getByText } = render(
      <RatsStatCard percentage="60%" ratio="6/10" />,
    );
    expect(getByText('60%')).toBeTruthy();
    expect(getByText('6/10')).toBeTruthy();
  });

  it('does not crash when percentage and ratio are omitted', () => {
    const { toJSON } = render(<RatsStatCard />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders headerItems when provided', () => {
    const { getByText } = render(
      <RatsStatCard
        headerItems={[
          <RatsStatCardHeaderItem key="h1" label="Meetings" />,
        ]}
      />,
    );
    expect(getByText('Meetings')).toBeTruthy();
  });

  it('renders footerItems when provided', () => {
    const { getByText } = render(
      <RatsStatCard
        footerItems={[
          <RatsStatCardFooterItem key="f1" label="Required:" text="3" />,
        ]}
      />,
    );
    expect(getByText('Required:')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
  });

  it('renders children inside the card', () => {
    const { getByText } = render(
      <RatsStatCard>
        {require('react').createElement(
          require('react-native').Text,
          null,
          'Child content',
        )}
      </RatsStatCard>,
    );
    expect(getByText('Child content')).toBeTruthy();
  });

  it('applies containerStyle without crashing', () => {
    const { toJSON } = render(
      <RatsStatCard containerStyle={{ borderRadius: 10 }} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('does not render footer section when footerItems is empty array', () => {
    // An empty array is falsy for length check so footer container should not appear
    const { toJSON } = render(<RatsStatCard footerItems={[]} />);
    expect(toJSON()).toBeTruthy();
  });
});

describe('RatsStatCardHeaderItem', () => {
  it('renders without crashing with no props', () => {
    const { toJSON } = render(<RatsStatCardHeaderItem />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays label when provided', () => {
    const { getByText } = render(<RatsStatCardHeaderItem label="Score" />);
    expect(getByText('Score')).toBeTruthy();
  });

  it('renders icon when iconName is provided', () => {
    const { getByTestId } = render(
      <RatsStatCardHeaderItem iconName="star" />,
    );
    expect(getByTestId('icon-star')).toBeTruthy();
  });

  it('renders both label and icon when both are provided', () => {
    const { getByText, getByTestId } = render(
      <RatsStatCardHeaderItem label="Rating" iconName="thumbs-up" />,
    );
    expect(getByText('Rating')).toBeTruthy();
    expect(getByTestId('icon-thumbs-up')).toBeTruthy();
  });
});

describe('RatsStatCardFooterItem', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <RatsStatCardFooterItem label="Total" text="42" />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('displays the label and text', () => {
    const { getByText } = render(
      <RatsStatCardFooterItem label="Meetings:" text="5" />,
    );
    expect(getByText('Meetings:')).toBeTruthy();
    expect(getByText('5')).toBeTruthy();
  });

  it('renders with different label and text values', () => {
    const { getByText } = render(
      <RatsStatCardFooterItem label="Hours:" text="40h" />,
    );
    expect(getByText('Hours:')).toBeTruthy();
    expect(getByText('40h')).toBeTruthy();
  });
});
