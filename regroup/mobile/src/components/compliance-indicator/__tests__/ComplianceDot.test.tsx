/**
 * Tests for ComplianceDot component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import ComplianceDot from '../ComplianceDot';

describe('ComplianceDot', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<ComplianceDot status="compliant" />);
    expect(getByTestId('compliance-dot-compliant')).toBeTruthy();
  });

  it('applies testID when provided', () => {
    const { getByTestId } = render(
      <ComplianceDot status="compliant" testID="my-dot" />,
    );
    expect(getByTestId('my-dot')).toBeTruthy();
  });

  describe('status — compliant', () => {
    it('renders a green dot for compliant status', () => {
      const { getByTestId } = render(<ComplianceDot status="compliant" />);
      const dot = getByTestId('compliance-dot-compliant');
      // The color is applied via inline style; verify the element exists
      expect(dot).toBeTruthy();
      // backgroundColor should be the app green (#009A39)
      const style = dot.props.style;
      const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;
      expect(flatStyle.backgroundColor).toBe('#009A39');
    });
  });

  describe('status — non-compliant', () => {
    it('renders a red dot for non-compliant status', () => {
      const { getByTestId } = render(<ComplianceDot status="non-compliant" />);
      const dot = getByTestId('compliance-dot-non-compliant');
      const style = dot.props.style;
      const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;
      expect(flatStyle.backgroundColor).toBe('#bb0000');
    });
  });

  describe('status — incomplete-data', () => {
    it('renders a dark grey dot for incomplete-data status', () => {
      const { getByTestId } = render(<ComplianceDot status="incomplete-data" />);
      const dot = getByTestId('compliance-dot-incomplete-data');
      const style = dot.props.style;
      const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;
      expect(flatStyle.backgroundColor).toBe('#707070');
    });
  });

  describe('status — loading', () => {
    it('renders a medium grey dot for loading status', () => {
      const { getByTestId } = render(<ComplianceDot status="loading" />);
      const dot = getByTestId('compliance-dot-loading');
      const style = dot.props.style;
      const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;
      expect(flatStyle.backgroundColor).toBe('#d3d3d3');
    });
  });

  it('renders a circular shape (borderRadius = width / 2)', () => {
    const { getByTestId } = render(<ComplianceDot status="compliant" />);
    const dot = getByTestId('compliance-dot-compliant');
    const style = dot.props.style;
    const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;
    // borderRadius should be exactly half of width = half of height
    expect(flatStyle.borderRadius).toBe(flatStyle.width / 2);
    expect(flatStyle.width).toBe(flatStyle.height);
  });
});
