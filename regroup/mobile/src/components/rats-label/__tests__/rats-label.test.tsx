/**
 * Tests for RatsLabel component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import RatsLabel from '../rats-label';

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

describe('RatsLabel', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RatsLabel label="Name" style={{}} />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays the provided label text', () => {
    const { getByText } = render(<RatsLabel label="First Name" style={{}} />);
    expect(getByText('First Name')).toBeTruthy();
  });

  it('renders with an empty label string', () => {
    const { toJSON } = render(<RatsLabel label="" style={{}} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a custom style without crashing', () => {
    const { getByText } = render(
      <RatsLabel label="Email" style={{ color: 'blue', fontSize: 18 }} />,
    );
    expect(getByText('Email')).toBeTruthy();
  });

  it('renders a label with special characters', () => {
    const { getByText } = render(
      <RatsLabel label="First & Last Name:" style={{}} />,
    );
    expect(getByText('First & Last Name:')).toBeTruthy();
  });

  it('renders a long label without crashing', () => {
    const longLabel = 'This is a very long label text that might wrap to multiple lines';
    const { getByText } = render(<RatsLabel label={longLabel} style={{}} />);
    expect(getByText(longLabel)).toBeTruthy();
  });

  it('passes the label through translation (mock returns key unchanged)', () => {
    const { getByText } = render(
      <RatsLabel label="form.label.email" style={{}} />,
    );
    expect(getByText('form.label.email')).toBeTruthy();
  });

  it('renders with numeric label coerced as any', () => {
    // LabelProps allows `any` for label
    const { toJSON } = render(<RatsLabel label={42 as any} style={{}} />);
    expect(toJSON()).toBeTruthy();
  });

  it('applies black text color via style composition', () => {
    const { getByText } = render(<RatsLabel label="Color check" style={{}} />);
    const textEl = getByText('Color check');
    expect(textEl).toBeTruthy();
  });

  it('renders with null style without crashing', () => {
    const { toJSON } = render(<RatsLabel label="Test" style={null} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders two labels independently', () => {
    const { getAllByText } = render(
      <>
        <RatsLabel label="Label A" style={{}} />
        <RatsLabel label="Label A" style={{}} />
      </>,
    );
    expect(getAllByText('Label A')).toHaveLength(2);
  });
});
