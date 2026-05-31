/**
 * Tests for RatsHR (Horizontal Rule) component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { RatsHR, styles } from '../index';

describe('RatsHR', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RatsHR />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders a View element', () => {
    const { UNSAFE_getByType } = render(<RatsHR />);
    const { View } = require('react-native');
    expect(UNSAFE_getByType(View)).toBeTruthy();
  });

  it('has a border bottom width via default style', () => {
    const { UNSAFE_getByType } = render(<RatsHR />);
    const { View } = require('react-native');
    const view = UNSAFE_getByType(View);
    // Flatten the style array to a plain object
    const flatStyle = StyleSheet.flatten(view.props.style);
    expect(flatStyle.borderBottomWidth).toBe(3);
  });

  it('stretches to full width (alignSelf: stretch)', () => {
    const { UNSAFE_getByType } = render(<RatsHR />);
    const { View } = require('react-native');
    const view = UNSAFE_getByType(View);
    const flatStyle = StyleSheet.flatten(view.props.style);
    expect(flatStyle.alignSelf).toBe('stretch');
  });

  it('has a borderBottomColor from theme grey', () => {
    const { UNSAFE_getByType } = render(<RatsHR />);
    const { View } = require('react-native');
    const view = UNSAFE_getByType(View);
    const flatStyle = StyleSheet.flatten(view.props.style);
    expect(flatStyle.borderBottomColor).toBeTruthy();
  });

  it('merges custom style with default style', () => {
    const customStyle = { marginTop: 8 };
    const { UNSAFE_getByType } = render(<RatsHR style={customStyle} />);
    const { View } = require('react-native');
    const view = UNSAFE_getByType(View);
    const flatStyle = StyleSheet.flatten(view.props.style);
    expect(flatStyle.marginTop).toBe(8);
    // Default style properties still present
    expect(flatStyle.borderBottomWidth).toBe(3);
  });

  it('custom style can override borderBottomWidth', () => {
    const customStyle = { borderBottomWidth: 1 };
    const { UNSAFE_getByType } = render(<RatsHR style={customStyle} />);
    const { View } = require('react-native');
    const view = UNSAFE_getByType(View);
    const flatStyle = StyleSheet.flatten(view.props.style);
    expect(flatStyle.borderBottomWidth).toBe(1);
  });

  it('renders with no style prop (undefined)', () => {
    const { toJSON } = render(<RatsHR style={undefined} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with null-like empty style object', () => {
    const { toJSON } = render(<RatsHR style={{}} />);
    expect(toJSON()).toBeTruthy();
  });

  it('styles export contains horizontalRule key', () => {
    expect(styles).toHaveProperty('horizontalRule');
  });

  it('styles.horizontalRule has correct shape', () => {
    const hr = StyleSheet.flatten(styles.horizontalRule);
    expect(hr).toMatchObject({
      borderBottomWidth: 3,
      alignSelf: 'stretch',
    });
  });

  it('snapshot matches with no props', () => {
    const { toJSON } = render(<RatsHR />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('snapshot matches with custom style', () => {
    const { toJSON } = render(
      <RatsHR style={{ marginVertical: 10, opacity: 0.5 }} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
