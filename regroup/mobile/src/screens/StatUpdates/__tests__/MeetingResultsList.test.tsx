jest.mock('../../../components/rats-flat-list', () => ({
  RatsFlatList: ({ data, renderItem, testID }: any) => {
    const { View } = require('react-native');
    return (
      <View testID={testID}>
        {data.map((item: any, index: number) => renderItem({ item, index }))}
      </View>
    );
  },
}));

jest.mock('../../../components/rats-icon', () => ({
  RatsIcon: () => null,
  ClickableIcon: () => null,
}));

jest.mock('../../../components/rats-image', () => ({
  RatsImage: () => null,
}));

jest.mock('../../../components/rats-button/rats-button', () => () => null);

jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text, testID }: any) => {
    const { Text } = require('react-native');
    return <Text testID={testID}>{text}</Text>;
  },
}));

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

jest.mock(
  '../../../assets',
  () => ({ aaLogo: null, naLogo: null, crLogo: null }),
  { virtual: true },
);

import React from 'react';
import { render } from '@testing-library/react-native';
import MeetingResultsList from '../MeetingResultsList';
import { RatsMeeting } from '../../../entities/Meeting';
import { MeetingFilters } from '../MeetingFilterForm';

const mockMeeting: RatsMeeting = {
  id: 'meeting-1',
  name: 'Serenity Group',
  type: 'AA',
  day: 'monday',
  time: '19:00',
  street: '123 Main St',
  city: 'Denver',
  state: 'CO',
  zip: '80201',
  online: false,
} as RatsMeeting;

const defaultFilters: MeetingFilters = {
  ...new MeetingFilters(),
  day: 'all',
};

describe('MeetingResultsList', () => {
  it('renders the meetings list testID', () => {
    const { getByTestId } = render(
      <MeetingResultsList
        meetings={[mockMeeting]}
        filters={defaultFilters}
        searchTerm=""
        checkInto={jest.fn()}
        guestAttendedMeeting={jest.fn(() => false)}
        isMeetingDay={jest.fn(() => true)}
        isMeetingTime={jest.fn(() => true)}
        userAsGuest={null}
      />,
    );
    expect(getByTestId('meetings-list')).toBeTruthy();
  });

  it('renders a meeting name in the list', () => {
    const { getByText } = render(
      <MeetingResultsList
        meetings={[mockMeeting]}
        filters={defaultFilters}
        searchTerm=""
        checkInto={jest.fn()}
        guestAttendedMeeting={jest.fn(() => false)}
        isMeetingDay={jest.fn(() => true)}
        isMeetingTime={jest.fn(() => true)}
        userAsGuest={null}
      />,
    );
    expect(getByText('Serenity Group')).toBeTruthy();
  });
});
