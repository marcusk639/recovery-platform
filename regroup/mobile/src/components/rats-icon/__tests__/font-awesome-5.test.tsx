/**
 * RatsFontAwesome5 picks the FontAwesome5 style the way react-native-vector-icons 9 did
 * (RN 0.88 upgrade, Task 5): the requested style when it has the glyph, otherwise the first of
 * brand, regular, solid that does. v14 alone would render a blank regular glyph for "cog".
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import RatsFontAwesome5, { fontAwesome5Style } from '../font-awesome-5';

describe('fontAwesome5Style', () => {
  it('uses regular by default when regular has the glyph', () => {
    expect(fontAwesome5Style('user')).toBe('regular');
    expect(fontAwesome5Style('check-circle')).toBe('regular');
  });

  it('uses solid when asked and solid has the glyph', () => {
    expect(fontAwesome5Style('user', true)).toBe('solid');
    expect(fontAwesome5Style('cog', true)).toBe('solid');
  });

  it('falls back to solid for a solid-only glyph rendered without `solid`', () => {
    expect(fontAwesome5Style('cog')).toBe('solid');
    expect(fontAwesome5Style('home')).toBe('solid');
    expect(fontAwesome5Style('times')).toBe('solid');
  });

  it('falls back to brand for a brand glyph, whatever was asked', () => {
    expect(fontAwesome5Style('github')).toBe('brand');
    expect(fontAwesome5Style('github', true)).toBe('brand');
    expect(fontAwesome5Style('github', false, true)).toBe('brand');
  });

  it('keeps regular for an unknown name (as v9 did)', () => {
    expect(fontAwesome5Style('no-such-icon')).toBe('regular');
    expect(fontAwesome5Style('no-such-icon', true)).toBe('regular');
  });
});

describe('RatsFontAwesome5', () => {
  // jest.setup.js mocks the v14 static entry as the host component 'Icon'.
  it('passes iconStyle instead of the v9 solid flag, and every other prop through', () => {
    const { getByTestId } = render(
      <RatsFontAwesome5 testID="icon" name="cog" size={20} color="red" solid={false} />,
    );
    const icon = getByTestId('icon');
    expect(icon.props.iconStyle).toBe('solid');
    expect(icon.props.name).toBe('cog');
    expect(icon.props.size).toBe(20);
    expect(icon.props.color).toBe('red');
    expect(icon.props.solid).toBeUndefined();
  });

  it('renders a dual-style glyph in the style asked for', () => {
    const regular = render(<RatsFontAwesome5 testID="r" name="user" />).getByTestId('r');
    const solid = render(<RatsFontAwesome5 testID="s" name="user" solid />).getByTestId('s');
    expect(regular.props.iconStyle).toBe('regular');
    expect(solid.props.iconStyle).toBe('solid');
  });
});
