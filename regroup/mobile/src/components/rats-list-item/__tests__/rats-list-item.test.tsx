/**
 * Tests for RatsListItem component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import RatsListItem from '../index';

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: '#000',
      secondaryColor: '#fff',
      backgroundColor: '#fff',
      textColor: '#000',
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
      tertiaryColor: '#ccc',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

describe('RatsListItem', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <RatsListItem mainText="John Doe" subText="Member" />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('displays the mainText', () => {
    const { getByText } = render(
      <RatsListItem mainText="John Doe" subText="Member" />,
    );
    expect(getByText('John Doe')).toBeTruthy();
  });

  it('displays the subText', () => {
    const { getByText } = render(
      <RatsListItem mainText="Meeting Title" subText="Every Monday" />,
    );
    expect(getByText('Every Monday')).toBeTruthy();
  });

  it('displays both mainText and subText simultaneously', () => {
    const { getByText } = render(
      <RatsListItem mainText="Alpha Group" subText="Weekly" />,
    );
    expect(getByText('Alpha Group')).toBeTruthy();
    expect(getByText('Weekly')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <RatsListItem mainText="Tap Me" subText="subtitle" onPress={onPress} />,
    );
    fireEvent.press(getByText('Tap Me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders empty mainText without crashing', () => {
    const { toJSON } = render(<RatsListItem mainText="" subText="subtitle" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders empty subText without crashing', () => {
    const { toJSON } = render(<RatsListItem mainText="Title" subText="" />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom mainTextStyle without crashing', () => {
    const { getByText } = render(
      <RatsListItem
        mainText="Styled Title"
        subText="sub"
        mainTextStyle={{ color: 'purple' }}
      />,
    );
    expect(getByText('Styled Title')).toBeTruthy();
  });

  it('accepts custom subTextStyle without crashing', () => {
    const { getByText } = render(
      <RatsListItem
        mainText="Title"
        subText="Styled Sub"
        subTextStyle={{ color: 'green' }}
      />,
    );
    expect(getByText('Styled Sub')).toBeTruthy();
  });

  it('accepts a custom container style', () => {
    const { toJSON } = render(
      <RatsListItem
        mainText="Styled"
        subText="sub"
        style={{ backgroundColor: '#eee' }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with a disabled state without crashing', () => {
    const { toJSON } = render(
      <RatsListItem mainText="Disabled" subText="not clickable" disabled />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('does not crash when onPress is not provided', () => {
    const { getByText } = render(
      <RatsListItem mainText="No handler" subText="fine" />,
    );
    expect(() => fireEvent.press(getByText('No handler'))).not.toThrow();
  });
});
