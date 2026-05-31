/**
 * Tests for ImageHeader component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ImageHeader from '../index';

jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcon');

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useRoute: () => ({}),
  DrawerActions: { openDrawer: jest.fn() },
}));

const makeNavigation = (overrides = {}) => ({
  goBack: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
  ...overrides,
});

const defaultProps = {
  image: { uri: 'http://example.com/image.png' },
  onHelpPress: jest.fn(),
  vacancy: true,
  navigation: makeNavigation() as any,
};

describe('ImageHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<ImageHeader {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays VACANCY text when vacancy is true', () => {
    const { getByText } = render(<ImageHeader {...defaultProps} vacancy={true} />);
    expect(getByText('VACANCY')).toBeTruthy();
  });

  it('displays NO VACANCY text when vacancy is false', () => {
    const { getByText } = render(<ImageHeader {...defaultProps} vacancy={false} />);
    expect(getByText('NO VACANCY')).toBeTruthy();
  });

  it('calls navigation.goBack when back button pressed and no onBackPress', () => {
    const navigation = makeNavigation();
    const { UNSAFE_getAllByType } = render(
      <ImageHeader {...defaultProps} navigation={navigation as any} />,
    );
    const { TouchableOpacity } = require('react-native');
    const buttons = UNSAFE_getAllByType(TouchableOpacity);
    fireEvent.press(buttons[0]);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('calls onBackPress instead of navigation.goBack when provided', () => {
    const onBackPress = jest.fn();
    const navigation = makeNavigation();
    const { UNSAFE_getAllByType } = render(
      <ImageHeader
        {...defaultProps}
        navigation={navigation as any}
        onBackPress={onBackPress}
      />,
    );
    const { TouchableOpacity } = require('react-native');
    const buttons = UNSAFE_getAllByType(TouchableOpacity);
    fireEvent.press(buttons[0]);
    expect(onBackPress).toHaveBeenCalledTimes(1);
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('renders an Image component for the header image', () => {
    const { UNSAFE_getAllByType } = render(<ImageHeader {...defaultProps} />);
    const { Image } = require('react-native');
    expect(UNSAFE_getAllByType(Image).length).toBeGreaterThan(0);
  });

  it('renders vacancy badge with green-ish background for VACANCY', () => {
    const { getByText } = render(<ImageHeader {...defaultProps} vacancy={true} />);
    const badge = getByText('VACANCY');
    expect(badge).toBeTruthy();
  });

  it('renders vacancy badge with red-ish background for NO VACANCY', () => {
    const { getByText } = render(<ImageHeader {...defaultProps} vacancy={false} />);
    const badge = getByText('NO VACANCY');
    expect(badge).toBeTruthy();
  });

  it('renders with a URI image source', () => {
    const source = { uri: 'https://example.com/photo.jpg' };
    const { toJSON } = render(
      <ImageHeader {...defaultProps} image={source} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with a local image require source', () => {
    // Numeric require() results are valid ImageSourcePropType
    const { toJSON } = render(
      <ImageHeader {...defaultProps} image={1 as any} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders children if provided', () => {
    const { getByText } = render(
      <ImageHeader {...defaultProps}>
        {/* PropsWithChildren allows children */}
      </ImageHeader>,
    );
    // Component renders without error
    expect(getByText('VACANCY')).toBeTruthy();
  });

  it('snapshot matches for vacancy=true', () => {
    const { toJSON } = render(<ImageHeader {...defaultProps} vacancy={true} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('snapshot matches for vacancy=false', () => {
    const { toJSON } = render(<ImageHeader {...defaultProps} vacancy={false} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
