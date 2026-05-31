/**
 * Tests for RatsImagePicker component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ── core mocks ────────────────────────────────────────────────────────────────

jest.mock('../../../styles/theme', () => ({
  normalize: (n: number) => n,
  color: { light_grey: '#eee', baby_blue: '#89cff0', black: '#000', white: '#fff', grey: '#aaa', dark_grey: '#555', red: '#f00', green: '#0f0', medium_grey: '#999' },
  fontSize: { regular: 14, regular_medium: 16, medium: 15, large: 18, small: 12, larger: 22, extraLarge: 24 },
  fontFamily: { roboto: 'Roboto', bold: 'Roboto-Bold', timesNewRoman: 'TimesNewRoman' },
  ROW: { flexDirection: 'row' as const },
  CARD_STYLE: {},
  tabBarStyle: {},
  elevateStyle: {},
  themes: { default: { primaryColor: '#000' } },
  windowHeight: 800,
}));

jest.mock('../../../context', () => ({
  useTheme: () => ({ theme: { primaryColor: '#000' } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

jest.mock('react-native-image-picker', () => ({
  __esModule: true,
  launchImageLibrary: jest.fn(),
  launchCamera: jest.fn(),
  ImageLibraryOptions: {},
}));

jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));

// stub sub-components to simple renderable strings
jest.mock('../../rats-text', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { RatsText: ({ text }: any) => <Text>{text}</Text> };
});

jest.mock('../../rats-label/rats-label', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ label }: any) => <Text>{label}</Text>;
});

jest.mock('../../rats-button/rats-button', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress }: any) => (
    <TouchableOpacity testID={`btn-${title}`} onPress={onPress}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

jest.mock('../../rats-image', () => {
  const React = require('react');
  const { Image } = require('react-native');
  return { RatsImage: (props: any) => <Image testID="rats-image" {...props} /> };
});

jest.mock('../../rats-icon/rats-icon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { RatsIcon: (props: any) => <View testID={`icon-${props.name}`} /> };
});

import RatsImagePicker from '../index';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';

const mockLaunchImageLibrary = launchImageLibrary as jest.Mock;
const mockLaunchCamera = launchCamera as jest.Mock;

const defaultProps = {
  label: 'Profile Photo',
  onImageSelect: jest.fn(),
  onClear: jest.fn(),
};

describe('RatsImagePicker (default / non-avatar mode)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<RatsImagePicker {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the label', () => {
    const { getByText } = render(<RatsImagePicker {...defaultProps} label="My Photo" />);
    expect(getByText('My Photo')).toBeTruthy();
  });

  it('renders the LIBRARY button', () => {
    const { getByTestId } = render(<RatsImagePicker {...defaultProps} />);
    expect(getByTestId('btn-LIBRARY')).toBeTruthy();
  });

  it('renders the CAMERA button', () => {
    const { getByTestId } = render(<RatsImagePicker {...defaultProps} />);
    expect(getByTestId('btn-CAMERA')).toBeTruthy();
  });

  it('renders the Clear button', () => {
    const { getByText } = render(<RatsImagePicker {...defaultProps} />);
    expect(getByText('Clear')).toBeTruthy();
  });

  it('shows "No photo selected" placeholder when no uri', () => {
    const { getByText } = render(<RatsImagePicker {...defaultProps} uri="" />);
    expect(getByText('No photo selected')).toBeTruthy();
  });

  it('does NOT show "No photo selected" when uri is provided', () => {
    const { queryByText } = render(
      <RatsImagePicker {...defaultProps} uri="https://example.com/img.jpg" />,
    );
    expect(queryByText('No photo selected')).toBeNull();
  });

  it('shows an image when uri is provided', () => {
    const { getByTestId } = render(
      <RatsImagePicker {...defaultProps} uri="https://example.com/img.jpg" />,
    );
    expect(getByTestId('rats-image')).toBeTruthy();
  });

  it('calls onClear when Clear is pressed', () => {
    const onClear = jest.fn();
    const { getByText } = render(
      <RatsImagePicker {...defaultProps} onClear={onClear} />,
    );
    fireEvent.press(getByText('Clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('calls launchImageLibrary when LIBRARY button is pressed', () => {
    const { getByTestId } = render(<RatsImagePicker {...defaultProps} />);
    fireEvent.press(getByTestId('btn-LIBRARY'));
    expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1);
  });

  it('calls launchCamera when CAMERA button is pressed', () => {
    const { getByTestId } = render(<RatsImagePicker {...defaultProps} />);
    fireEvent.press(getByTestId('btn-CAMERA'));
    expect(mockLaunchCamera).toHaveBeenCalledTimes(1);
  });

  it('calls imageHandler instead of defaultImageHandler when provided', () => {
    const imageHandler = jest.fn();
    const { getByTestId } = render(
      <RatsImagePicker {...defaultProps} imageHandler={imageHandler} />,
    );
    mockLaunchImageLibrary.mockImplementationOnce((_opts: any, cb: any) => {
      cb({ assets: [{ uri: 'https://x.com/a.jpg' }] });
    });
    fireEvent.press(getByTestId('btn-LIBRARY'));
    expect(imageHandler).toHaveBeenCalledTimes(1);
  });
});

describe('RatsImagePicker (avatarStyle mode)', () => {
  it('renders in avatar mode without crashing', () => {
    const { toJSON } = render(<RatsImagePicker {...defaultProps} avatarStyle />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows file-image icon placeholder in avatar mode when no uri', () => {
    const { getByTestId } = render(<RatsImagePicker {...defaultProps} avatarStyle uri="" />);
    expect(getByTestId('icon-file-image')).toBeTruthy();
  });

  it('shows avatar image when uri is provided in avatar mode', () => {
    const { getByTestId } = render(
      <RatsImagePicker {...defaultProps} avatarStyle uri="https://example.com/img.jpg" />,
    );
    expect(getByTestId('rats-image')).toBeTruthy();
  });
});
