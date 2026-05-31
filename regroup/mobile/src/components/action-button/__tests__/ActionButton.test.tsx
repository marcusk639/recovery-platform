import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ActionButton } from '../index';

jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcon');
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({}),
}));

describe('ActionButton', () => {
  const defaultProps = {
    iconName: 'home',
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<ActionButton {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the icon', () => {
    const { toJSON } = render(
      <ActionButton iconName="star" onPress={jest.fn()} />,
    );
    const json = JSON.stringify(toJSON());
    // FontAwesome5Icon should be present in the rendered tree
    expect(json).toContain('FontAwesome5Icon');
  });

  it('renders text when text prop is provided', () => {
    const { getByText } = render(
      <ActionButton {...defaultProps} text="Press me" />,
    );
    expect(getByText('Press me')).toBeTruthy();
  });

  it('does not render text element when text prop is omitted', () => {
    const { queryByText } = render(<ActionButton {...defaultProps} />);
    expect(queryByText('Press me')).toBeNull();
  });

  it('renders description when description prop is provided', () => {
    const { getByText } = render(
      <ActionButton {...defaultProps} description="Some description" />,
    );
    expect(getByText('Some description')).toBeTruthy();
  });

  it('does not render description when description prop is omitted', () => {
    const { queryByText } = render(<ActionButton {...defaultProps} />);
    expect(queryByText('Some description')).toBeNull();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { UNSAFE_getByType } = render(
      <ActionButton iconName="home" onPress={onPress} />,
    );
    const { TouchableOpacity } = require('react-native');
    const touchable = UNSAFE_getByType(TouchableOpacity);
    fireEvent.press(touchable);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders both text and description together', () => {
    const { getByText } = render(
      <ActionButton
        {...defaultProps}
        text="Action"
        description="Description text"
      />,
    );
    expect(getByText('Action')).toBeTruthy();
    expect(getByText('Description text')).toBeTruthy();
  });

  it('accepts custom iconSize prop', () => {
    const { toJSON } = render(
      <ActionButton {...defaultProps} iconSize={24} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom style prop', () => {
    const { toJSON } = render(
      <ActionButton {...defaultProps} style={{ backgroundColor: 'red' }} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom iconStyle prop', () => {
    const { toJSON } = render(
      <ActionButton {...defaultProps} iconStyle={{ color: 'blue' }} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom textStyle prop', () => {
    const { toJSON } = render(
      <ActionButton
        {...defaultProps}
        text="Styled"
        textStyle={{ fontSize: 20 }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom descriptionStyle prop', () => {
    const { toJSON } = render(
      <ActionButton
        {...defaultProps}
        description="Styled desc"
        descriptionStyle={{ color: 'green' }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });
});
