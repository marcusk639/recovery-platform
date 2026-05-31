/**
 * Tests for RatsText component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import RatsText from '../rats-text';

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

describe('RatsText', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RatsText text="Hello" />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays the provided text', () => {
    const { getByText } = render(<RatsText text="Welcome" />);
    expect(getByText('Welcome')).toBeTruthy();
  });

  it('uppercases text when toUpper is true', () => {
    const { getByText } = render(<RatsText text="hello world" toUpper />);
    expect(getByText('HELLO WORLD')).toBeTruthy();
  });

  it('does not uppercase text when toUpper is false', () => {
    const { getByText } = render(
      <RatsText text="hello world" toUpper={false} />,
    );
    expect(getByText('hello world')).toBeTruthy();
  });

  it('passes text through translation when translate is true (default)', () => {
    // The mock t() returns the key unchanged, so the displayed text equals the key
    const { getByText } = render(<RatsText text="some.key" translate />);
    expect(getByText('some.key')).toBeTruthy();
  });

  it('skips translation and renders raw text when translate is false', () => {
    const { getByText } = render(
      <RatsText text="raw string" translate={false} />,
    );
    expect(getByText('raw string')).toBeTruthy();
  });

  it('combines toUpper with translate=false', () => {
    const { getByText } = render(
      <RatsText text="mixed Case" translate={false} toUpper />,
    );
    expect(getByText('MIXED CASE')).toBeTruthy();
  });

  it('applies custom style without crashing', () => {
    const { getByText } = render(
      <RatsText text="Styled" style={{ color: 'red' }} />,
    );
    expect(getByText('Styled')).toBeTruthy();
  });

  it('applies the primary font family from theme', () => {
    const { getByText } = render(<RatsText text="Font check" />);
    const textEl = getByText('Font check');
    const styles: any[] = [].concat(textEl.props.style ?? []);
    const flat = Object.assign({}, ...styles);
    expect(flat.fontFamily).toBe('System');
  });

  it('renders an empty string without crashing', () => {
    const { toJSON } = render(<RatsText text="" />);
    expect(toJSON()).toBeTruthy();
  });

  it('forwards numberOfLines prop', () => {
    const { getByText } = render(
      <RatsText text="Long text" numberOfLines={2} />,
    );
    expect(getByText('Long text').props.numberOfLines).toBe(2);
  });

  it('renders with translateParams without crashing', () => {
    const { getByText } = render(
      <RatsText text="greeting" translateParams={{ name: 'Marcus' }} />,
    );
    // t() mock ignores params and returns the key
    expect(getByText('greeting')).toBeTruthy();
  });
});
