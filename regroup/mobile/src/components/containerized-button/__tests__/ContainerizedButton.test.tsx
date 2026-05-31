import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ContainerizedButton } from '../index';

jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcon');
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({}),
}));

describe('ContainerizedButton', () => {
  const defaultProps = {
    title: 'Click Me',
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<ContainerizedButton {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the title text', () => {
    const { getByText } = render(<ContainerizedButton {...defaultProps} />);
    expect(getByText('Click Me')).toBeTruthy();
  });

  it('calls onPress when button is pressed', () => {
    const onPress = jest.fn();
    const { UNSAFE_getByType } = render(
      <ContainerizedButton title="Test" onPress={onPress} />,
    );
    const { TouchableOpacity } = require('react-native');
    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders description when provided', () => {
    const { getByText } = render(
      <ContainerizedButton
        {...defaultProps}
        description="Some detail text"
      />,
    );
    expect(getByText('Some detail text')).toBeTruthy();
  });

  it('does not render description when omitted', () => {
    const { queryByText } = render(
      <ContainerizedButton {...defaultProps} />,
    );
    expect(queryByText('Some detail text')).toBeNull();
  });

  it('renders icon when iconName is provided', () => {
    const { toJSON } = render(
      <ContainerizedButton {...defaultProps} iconName="star" />,
    );
    const json = JSON.stringify(toJSON());
    expect(json).toContain('FontAwesome5Icon');
  });

  it('does not render icon when iconName is omitted', () => {
    const { toJSON } = render(<ContainerizedButton {...defaultProps} />);
    const json = JSON.stringify(toJSON());
    expect(json).not.toContain('FontAwesome5Icon');
  });

  it('accepts a custom containerStyle', () => {
    const { toJSON } = render(
      <ContainerizedButton
        {...defaultProps}
        containerStyle={{ backgroundColor: 'red' }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a custom touchableOpacityStyle', () => {
    const { toJSON } = render(
      <ContainerizedButton
        {...defaultProps}
        touchableOpacityStyle={{ padding: 20 }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a custom titleStyle', () => {
    const { toJSON } = render(
      <ContainerizedButton
        {...defaultProps}
        titleStyle={{ fontSize: 24 }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a custom descriptionStyle', () => {
    const { toJSON } = render(
      <ContainerizedButton
        {...defaultProps}
        description="Info"
        descriptionStyle={{ color: 'blue' }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a custom iconStyle', () => {
    const { toJSON } = render(
      <ContainerizedButton
        {...defaultProps}
        iconName="home"
        iconStyle={{ color: 'green' }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders both title and description together', () => {
    const { getByText } = render(
      <ContainerizedButton
        title="My Title"
        description="My Description"
        onPress={jest.fn()}
      />,
    );
    expect(getByText('My Title')).toBeTruthy();
    expect(getByText('My Description')).toBeTruthy();
  });

  it('renders title with icon and description all together', () => {
    const { getByText, toJSON } = render(
      <ContainerizedButton
        title="Full Button"
        description="Full desc"
        iconName="check"
        onPress={jest.fn()}
      />,
    );
    expect(getByText('Full Button')).toBeTruthy();
    expect(getByText('Full desc')).toBeTruthy();
    const json = JSON.stringify(toJSON());
    expect(json).toContain('FontAwesome5Icon');
  });
});
