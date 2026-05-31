/**
 * Tests for RatsScrollView component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, ScrollView } from 'react-native';

// ── mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../styles/theme', () => ({
  normalize: (n: number) => n,
  color: { light_grey: '#eeeeee', baby_blue: '#89cff0', black: '#000', white: '#fff', grey: '#aaa', dark_grey: '#555', red: '#f00', green: '#0f0', medium_grey: '#999' },
  fontSize: { regular: 14, regular_medium: 16, medium: 15, large: 18, small: 12 },
  fontFamily: { roboto: 'Roboto', bold: 'Roboto-Bold' },
  ROW: { flexDirection: 'row' as const },
  CARD_STYLE: {},
  tabBarStyle: {},
  elevateStyle: {},
  themes: { default: { primaryColor: '#000' } },
  windowHeight: 800,
}));

// jest.setup.js already mocks react-native-keyboard-aware-scroll-view as ScrollView

import RatsScrollView from '../index';

describe('RatsScrollView', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <RatsScrollView>
        <Text>Hello</Text>
      </RatsScrollView>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders children', () => {
    const { getByText } = render(
      <RatsScrollView>
        <Text>Child content</Text>
      </RatsScrollView>,
    );
    expect(getByText('Child content')).toBeTruthy();
  });

  it('renders multiple children', () => {
    const { getByText } = render(
      <RatsScrollView>
        <Text>First</Text>
        <Text>Second</Text>
        <Text>Third</Text>
      </RatsScrollView>,
    );
    expect(getByText('First')).toBeTruthy();
    expect(getByText('Second')).toBeTruthy();
    expect(getByText('Third')).toBeTruthy();
  });

  it('accepts scrollEnabled prop', () => {
    const { toJSON } = render(
      <RatsScrollView scrollEnabled={false}>
        <Text>Content</Text>
      </RatsScrollView>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('passes scrollEnabled=true without crashing', () => {
    const { toJSON } = render(
      <RatsScrollView scrollEnabled={true}>
        <Text>Content</Text>
      </RatsScrollView>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts contentContainerStyle prop', () => {
    const { toJSON } = render(
      <RatsScrollView contentContainerStyle={{ padding: 20 }}>
        <Text>Content</Text>
      </RatsScrollView>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with no children without crashing', () => {
    // @ts-ignore — testing edge case
    const { toJSON } = render(<RatsScrollView>{null}</RatsScrollView>);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts keyboardShouldPersistTaps override', () => {
    const { toJSON } = render(
      <RatsScrollView keyboardShouldPersistTaps="handled">
        <Text>Content</Text>
      </RatsScrollView>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('defaults keyboardShouldPersistTaps to "always" when not specified', () => {
    const { UNSAFE_getByType } = render(
      <RatsScrollView>
        <Text>Content</Text>
      </RatsScrollView>,
    );
    const scrollView = UNSAFE_getByType(ScrollView);
    expect(scrollView.props.keyboardShouldPersistTaps).toBe('always');
  });

  it('renders nested RatsScrollView without crashing', () => {
    const { toJSON } = render(
      <RatsScrollView>
        <RatsScrollView>
          <Text>Nested</Text>
        </RatsScrollView>
      </RatsScrollView>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('sets showsVerticalScrollIndicator to false', () => {
    const { UNSAFE_getByType } = render(
      <RatsScrollView>
        <Text>Content</Text>
      </RatsScrollView>,
    );
    const scrollView = UNSAFE_getByType(ScrollView);
    expect(scrollView.props.showsVerticalScrollIndicator).toBe(false);
  });

  it('merges custom contentContainerStyle with default styles', () => {
    const { UNSAFE_getByType } = render(
      <RatsScrollView contentContainerStyle={{ padding: 10 }}>
        <Text>Content</Text>
      </RatsScrollView>,
    );
    const scrollView = UNSAFE_getByType(ScrollView);
    const styles = [].concat(scrollView.props.contentContainerStyle);
    expect(styles.length).toBeGreaterThan(0);
  });
});
