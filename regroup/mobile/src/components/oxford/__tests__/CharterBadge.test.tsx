jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
      primaryColor: '#000',
      secondaryColor: '#fff',
      tertiaryColor: '#ccc',
      backgroundColor: '#fff',
      textColor: '#000',
      logoTintColor: '#fff',
    },
  }),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text, testID }: any) => {
    const { Text } = require('react-native');
    return <Text testID={testID}>{text}</Text>;
  },
}));

import React from 'react';
import { render } from '@testing-library/react-native';
import CharterBadge from '../CharterBadge';

describe('CharterBadge', () => {
  it('renders "Pass" label for pass status', () => {
    const { getByText } = render(<CharterBadge status="pass" testID="badge" />);
    expect(getByText('Pass')).toBeTruthy();
  });

  it('renders "Fail" label for fail status', () => {
    const { getByText } = render(<CharterBadge status="fail" testID="badge" />);
    expect(getByText('Fail')).toBeTruthy();
  });

  it('renders "No Data" label for insufficient_data status', () => {
    const { getByText } = render(
      <CharterBadge status="insufficient_data" testID="badge" />,
    );
    expect(getByText('No Data')).toBeTruthy();
  });

  it('forwards testID to the outer view', () => {
    const { getByTestId } = render(
      <CharterBadge status="pass" testID="my-badge" />,
    );
    expect(getByTestId('my-badge')).toBeTruthy();
  });
});
