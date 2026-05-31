import React from 'react';
import { render } from '@testing-library/react-native';
import AvatarItem from '../index';

jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcon');
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({}),
}));

describe('AvatarItem', () => {
  const defaultProps = {
    name: 'John Doe',
    type: 'Guest',
    avatarUrl: null,
  };

  it('renders without crashing', () => {
    const { toJSON } = render(<AvatarItem {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the name text', () => {
    const { getByText } = render(<AvatarItem {...defaultProps} />);
    expect(getByText('John Doe')).toBeTruthy();
  });

  it('renders the type text', () => {
    const { getByText } = render(<AvatarItem {...defaultProps} />);
    expect(getByText('Guest')).toBeTruthy();
  });

  it('renders both name and type', () => {
    const { getByText } = render(
      <AvatarItem name="Jane Smith" type="Admin" avatarUrl={null} />,
    );
    expect(getByText('Jane Smith')).toBeTruthy();
    expect(getByText('Admin')).toBeTruthy();
  });

  it('renders the avatar with a URI when avatarUrl is provided', () => {
    const { toJSON } = render(
      <AvatarItem
        name="John Doe"
        type="Guest"
        avatarUrl="https://example.com/avatar.png"
      />,
    );
    const json = JSON.stringify(toJSON());
    expect(json).toContain('https://example.com/avatar.png');
  });

  it('renders initials placeholder when avatarUrl is null', () => {
    const { getByText } = render(
      <AvatarItem name="John Doe" type="Guest" avatarUrl={null} />,
    );
    // Initials of "John Doe" = "JD"
    expect(getByText('JD')).toBeTruthy();
  });

  it('renders with custom container style', () => {
    const { toJSON } = render(
      <AvatarItem
        {...defaultProps}
        container={{ backgroundColor: 'red' }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with custom nameStyle', () => {
    const { toJSON } = render(
      <AvatarItem
        {...defaultProps}
        nameStyle={{ fontSize: 20 }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with custom subTextStyle', () => {
    const { toJSON } = render(
      <AvatarItem
        {...defaultProps}
        subTextStyle={{ color: 'blue' }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with custom avatarStyle', () => {
    const { toJSON } = render(
      <AvatarItem
        {...defaultProps}
        avatarStyle={{ width: 60, height: 60 }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders correctly with a single-word name', () => {
    const { getByText } = render(
      <AvatarItem name="Alice" type="Supporter" avatarUrl={null} />,
    );
    expect(getByText('Alice')).toBeTruthy();
    expect(getByText('Supporter')).toBeTruthy();
  });

  it('renders correctly with a long name', () => {
    const { getByText } = render(
      <AvatarItem
        name="Alexandra Van Der Berg"
        type="Super Admin"
        avatarUrl={null}
      />,
    );
    expect(getByText('Alexandra Van Der Berg')).toBeTruthy();
    expect(getByText('Super Admin')).toBeTruthy();
  });
});
