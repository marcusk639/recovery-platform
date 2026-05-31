/**
 * Tests for RatsButton component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import RatsButton from '../rats-button';

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
  useTranslation: () => ({ t: (k: string) => k ?? '', i18n: { language: 'en' } }),
}));

/**
 * Walk a toJSON() tree to find the first node whose flattened style matches the
 * predicate. Returns the flattened style object or null.
 */
function findFlatStyle(
  node: any,
  predicate: (flat: Record<string, any>) => boolean,
): Record<string, any> | null {
  if (!node) return null;
  if (node.props?.style) {
    const arr: any[] = [].concat(node.props.style);
    const flat = Object.assign({}, ...arr);
    if (predicate(flat)) return flat;
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const result = findFlatStyle(child, predicate);
      if (result) return result;
    }
  }
  return null;
}

describe('RatsButton', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RatsButton title="Submit" />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays the title text uppercased', () => {
    const { getByText } = render(<RatsButton title="Save" />);
    expect(getByText('SAVE')).toBeTruthy();
  });

  it('renders with an empty title without crashing', () => {
    const { toJSON } = render(<RatsButton title="" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with only containerStyle and no title without crashing', () => {
    const { toJSON } = render(
      <RatsButton containerStyle={{ margin: 10 }} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<RatsButton title="Go" onPress={onPress} />);
    fireEvent.press(getByText('GO'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <RatsButton title="Go" onPress={onPress} disabled />,
    );
    fireEvent.press(getByText('GO'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('applies reduced opacity when disabled', () => {
    const { toJSON } = render(<RatsButton title="Action" disabled />);
    const flat = findFlatStyle(toJSON(), s => s.opacity !== undefined);
    expect(flat?.opacity).toBe(0.5);
  });

  it('applies full opacity when not disabled', () => {
    const { toJSON } = render(<RatsButton title="Action" />);
    const flat = findFlatStyle(toJSON(), s => s.opacity !== undefined);
    expect(flat?.opacity).toBe(1.0);
  });

  it('uses white background when light prop is true', () => {
    const { toJSON } = render(<RatsButton title="Light" light />);
    const flat = findFlatStyle(toJSON(), s => s.backgroundColor !== undefined);
    expect(flat?.backgroundColor).toBe('#ffffff');
  });

  it('uses baby-blue background when light prop is false', () => {
    const { toJSON } = render(<RatsButton title="Primary" light={false} />);
    const flat = findFlatStyle(toJSON(), s => s.backgroundColor !== undefined);
    expect(flat?.backgroundColor).toBe('#0094C6');
  });

  it('applies containerStyle when provided', () => {
    const { toJSON } = render(
      <RatsButton title="Styled" containerStyle={{ borderRadius: 8 }} />,
    );
    const flat = findFlatStyle(toJSON(), s => s.borderRadius !== undefined);
    expect(flat?.borderRadius).toBe(8);
  });

  it('renders multiple buttons independently', () => {
    const { getAllByText } = render(
      <>
        <RatsButton title="First" />
        <RatsButton title="First" />
      </>,
    );
    expect(getAllByText('FIRST')).toHaveLength(2);
  });
});
