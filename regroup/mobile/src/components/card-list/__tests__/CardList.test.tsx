import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import {
  CardList,
  ActivityItem,
  ActivityItemWithButtons,
  CardItem,
} from '../index';

jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcon');
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({}),
}));

// ─── CardList ───────────────────────────────────────────────────────────────

describe('CardList', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<CardList heading="Activities" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the heading in uppercase', () => {
    const { getByText } = render(<CardList heading="activities" />);
    expect(getByText('ACTIVITIES')).toBeTruthy();
  });

  it('renders children', () => {
    const { getByTestId } = render(
      <CardList heading="Test">
        <Text testID="child-item">Child</Text>
      </CardList>,
    );
    expect(getByTestId('child-item')).toBeTruthy();
  });

  it('renders multiple children', () => {
    const { getByTestId } = render(
      <CardList heading="Test">
        <Text testID="item-1">Item 1</Text>
        <Text testID="item-2">Item 2</Text>
      </CardList>,
    );
    expect(getByTestId('item-1')).toBeTruthy();
    expect(getByTestId('item-2')).toBeTruthy();
  });
});

// ─── ActivityItem ────────────────────────────────────────────────────────────

describe('ActivityItem', () => {
  const defaultProps = {
    description: 'Some description',
    descriptionHeader: 'Header text',
    boxedIconName: 'star',
    boxedIconBackground: '#abc',
  };

  it('renders without crashing', () => {
    const { toJSON } = render(<ActivityItem {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the description header', () => {
    const { getByText } = render(<ActivityItem {...defaultProps} />);
    expect(getByText('Header text')).toBeTruthy();
  });

  it('renders the description', () => {
    const { getByText } = render(<ActivityItem {...defaultProps} />);
    expect(getByText('Some description')).toBeTruthy();
  });

  it('applies testID when provided', () => {
    const { getByTestId } = render(
      <ActivityItem {...defaultProps} testID="my-activity" />,
    );
    expect(getByTestId('my-activity')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <ActivityItem {...defaultProps} testID="pressable" onPress={onPress} />,
    );
    fireEvent.press(getByTestId('pressable'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders with avatarName branch (shows avatar instead of boxed icon)', () => {
    const { getByText } = render(
      <ActivityItem
        description="Desc"
        descriptionHeader="Header"
        avatarName="John Doe"
        avatarUrl={undefined}
      />,
    );
    expect(getByText('Header')).toBeTruthy();
    expect(getByText('Desc')).toBeTruthy();
  });

  it('renders type=bad correctly', () => {
    const { toJSON } = render(
      <ActivityItem {...defaultProps} type="bad" />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders type=good correctly', () => {
    const { toJSON } = render(
      <ActivityItem {...defaultProps} type="good" />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders content when provided', () => {
    const { getByTestId } = render(
      <ActivityItem
        {...defaultProps}
        content={<Text testID="content-view">Custom Content</Text>}
      />,
    );
    expect(getByTestId('content-view')).toBeTruthy();
  });
});

// ─── ActivityItemWithButtons ─────────────────────────────────────────────────

describe('ActivityItemWithButtons', () => {
  const defaultProps = {
    description: 'Desc',
    descriptionHeader: 'Header',
    leftButtonTitle: 'Approve',
    leftButtonAction: jest.fn(),
  };

  it('renders without crashing', () => {
    const { toJSON } = render(<ActivityItemWithButtons {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the left button with its title', () => {
    const { getByText } = render(<ActivityItemWithButtons {...defaultProps} />);
    expect(getByText('APPROVE')).toBeTruthy();
  });

  it('renders a right button when rightButtonTitle is provided', () => {
    const { getByText } = render(
      <ActivityItemWithButtons
        {...defaultProps}
        rightButtonTitle="Reject"
        rightButtonAction={jest.fn()}
      />,
    );
    expect(getByText('REJECT')).toBeTruthy();
  });

  it('does not render buttons when disableButtons is true', () => {
    const { queryByText } = render(
      <ActivityItemWithButtons {...defaultProps} disableButtons />,
    );
    expect(queryByText('APPROVE')).toBeNull();
  });

  it('renders an error message when error prop is provided', () => {
    const { getByText } = render(
      <ActivityItemWithButtons {...defaultProps} error="Something went wrong" />,
    );
    expect(getByText('Something went wrong')).toBeTruthy();
  });
});

// ─── CardItem ────────────────────────────────────────────────────────────────

describe('CardItem', () => {
  it('renders without crashing with minimal props', () => {
    const { toJSON } = render(<CardItem />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders itemName and itemDescription', () => {
    const { getByText } = render(
      <CardItem
        itemName="Medication"
        itemDescription="Take daily"
        boxedIconName="pills"
        boxedIconBackground="#123"
      />,
    );
    expect(getByText('Medication')).toBeTruthy();
    expect(getByText('Take daily')).toBeTruthy();
  });

  it('renders with avatarName', () => {
    const { getByText } = render(
      <CardItem avatarName="Jane Doe" headerSubtext="Admin" />,
    );
    expect(getByText('Jane Doe')).toBeTruthy();
    expect(getByText('Admin')).toBeTruthy();
  });

  it('calls onExit when exit button is pressed', () => {
    const onExit = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <CardItem
        itemName="Task"
        boxedIconName="check"
        boxedIconBackground="#abc"
        onExit={onExit}
      />,
    );
    const { TouchableOpacity } = require('react-native');
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    // The last touchable is the exit button
    fireEvent.press(touchables[touchables.length - 1]);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
