/**
 * Tests for RatsAvatar component
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import RatsAvatar, { stringToColour } from '../index';

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
  useTranslation: () => ({ t: (k: string) => k ?? '', i18n: { language: 'en' } }),
}));

jest.mock('../../../util/platform', () => ({ IOS: false }));

// RatsImage renders a plain Image — no extra mock needed.
// Stub the internal RatsImage to avoid style-merge side effects.
jest.mock('../../rats-image', () => {
  const { Image } = require('react-native');
  return { RatsImage: (props: any) => <Image testID="rats-image" {...props} /> };
});

describe('RatsAvatar', () => {
  it('renders without crashing when given a name', () => {
    const { toJSON } = render(<RatsAvatar name="John Doe" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders initials placeholder when no source uri is provided', () => {
    const { getByText } = render(<RatsAvatar name="John Doe" />);
    expect(getByText('JD')).toBeTruthy();
  });

  it('renders single initial when name has only one word', () => {
    const { getByText } = render(<RatsAvatar name="Alice" />);
    expect(getByText('A')).toBeTruthy();
  });

  it('renders empty initials gracefully when name is empty string', () => {
    const { toJSON } = render(<RatsAvatar name="" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders an image when source uri is provided', () => {
    const { getByTestId } = render(
      <RatsAvatar name="John Doe" source={{ uri: 'https://example.com/photo.jpg' }} />,
    );
    expect(getByTestId('rats-image')).toBeTruthy();
  });

  it('does NOT render the image placeholder when source uri is provided', () => {
    const { queryByText } = render(
      <RatsAvatar name="John Doe" source={{ uri: 'https://example.com/photo.jpg' }} />,
    );
    expect(queryByText('JD')).toBeNull();
  });

  it('accepts a custom placeholderStyle without crashing', () => {
    const { toJSON } = render(
      <RatsAvatar name="Marcus Klein" placeholderStyle={{ borderRadius: 20 }} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a custom placeholderTextStyle without crashing', () => {
    const { toJSON } = render(
      <RatsAvatar name="Marcus Klein" placeholderTextStyle={{ fontSize: 24 }} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('uses uppercased initials', () => {
    const { getByText } = render(<RatsAvatar name="john doe" />);
    expect(getByText('JD')).toBeTruthy();
  });
});

// The initials are sized from the measured layout. Before the first onLayout
// the height is 0, and the New Architecture's Android text layer rejects a
// font size of 0 ("FontSize should be a positive value"), which crashed every
// screen showing a photo-less avatar.
describe('RatsAvatar initials font size', () => {
  const fontSizeOf = (ui: ReturnType<typeof render>) =>
    StyleSheet.flatten(ui.getByText('JD').props.style).fontSize;

  it('is never 0 before the first layout', () => {
    const ui = render(<RatsAvatar name="John Doe" />);

    expect(fontSizeOf(ui)).not.toBe(0);
    expect(fontSizeOf(ui)).toBeGreaterThan(0);
  });

  it('is half the measured height once laid out', () => {
    const ui = render(<RatsAvatar name="John Doe" />);

    fireEvent(ui.getByText('JD').parent!.parent!, 'layout', {
      nativeEvent: { layout: { height: 40, width: 40 } },
    });

    expect(fontSizeOf(ui)).toBe(20);
  });
});

describe('stringToColour', () => {
  it('returns a hsl string for a non-empty string', () => {
    const result = stringToColour('John');
    expect(result).toMatch(/^hsl\(-?\d+, 80%, 60%\)$/);
  });

  it('returns undefined for an empty string', () => {
    expect(stringToColour('')).toBeUndefined();
  });

  it('accepts custom saturation and lightness', () => {
    const result = stringToColour('Test', 50, 40);
    expect(result).toMatch(/^hsl\(-?\d+, 50%, 40%\)$/);
  });

  it('returns consistent results for the same input', () => {
    expect(stringToColour('Alice')).toBe(stringToColour('Alice'));
  });
});
