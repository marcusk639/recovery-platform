/**
 * The application screens are for the house's owners and managers (owner
 * decision 2026-11-27): the rules refuse a peer leader's reads and decisions,
 * so for a peer leader neither screen reads the applications, and both say
 * why; while the tier loads they wait.
 */
const mockUseHouseApplications = jest.fn((..._args: unknown[]): any => ({
  data: [
    {
      id: 'house-1_applicant',
      applicantName: 'Alice Applicant',
      applicantEmail: 'alice@example.com',
      status: 'pending',
    },
  ],
  isLoading: false,
}));
jest.mock('../../../state/queries/applicationQueries', () => ({
  useHouseApplications: (...args: unknown[]) => mockUseHouseApplications(...args),
  useUpdateApplicationStatus: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
let mockAccess: 'yes' | 'no' | 'checking' | 'error' = 'yes';
const mockRetry = jest.fn();
const mockUseApplicationsAccess = jest.fn((_houseId: string) => ({
  access: mockAccess,
  retry: mockRetry,
}));
jest.mock('../../../state/queries/houseTierQueries', () => ({
  useApplicationsAccess: (houseId: string) => mockUseApplicationsAccess(houseId),
}));
jest.mock('../../../state/store', () => ({
  useAppSelector: (select: (s: unknown) => unknown) =>
    select({ houses: { selectedHouseId: 'house-1' } }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { houseId: 'house-1', appId: 'house-1_applicant' } }),
}));
jest.mock('../../../components/screen-header', () => () => null);
jest.mock('../../../components/rats-loading-indicator/rats-loading-indicator', () => {
  const { View } = require('react-native');
  return () => <View testID="loading-indicator" />;
});
jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress, testID }: any) => (
    <TouchableOpacity testID={testID} onPress={onPress}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});
jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text }: { text: string }) => {
    const { Text } = require('react-native');
    return <Text>{text}</Text>;
  },
}));

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ApplicationListScreen from '../ApplicationListScreen';
import ApplicationDetailScreen from '../ApplicationDetailScreen';
import {
  APPLICATIONS_ACCESS_ERROR_MESSAGE,
  APPLICATIONS_NO_ACCESS_MESSAGE,
} from '../ApplicationsAccessState';

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess = 'yes';
});

describe.each([
  ['ApplicationListScreen', ApplicationListScreen],
  ['ApplicationDetailScreen', ApplicationDetailScreen],
] as const)('%s', (_name, Screen) => {
  it("checks the caller's tier for the selected house", () => {
    render(<Screen />);
    expect(mockUseApplicationsAccess).toHaveBeenCalledWith('house-1');
  });

  it('reads and shows the applications for an owner or manager', () => {
    const { getByText, queryByTestId } = render(<Screen />);
    expect(mockUseHouseApplications).toHaveBeenCalledWith('house-1', true);
    expect(getByText('Alice Applicant')).toBeTruthy();
    expect(queryByTestId('applications-no-access')).toBeNull();
  });

  it('reads nothing and says why for a peer leader', () => {
    mockAccess = 'no';
    const { getByTestId, getByText, queryByText } = render(<Screen />);
    expect(mockUseHouseApplications).not.toHaveBeenCalledWith('house-1', true);
    expect(getByTestId('applications-no-access')).toBeTruthy();
    expect(getByText(APPLICATIONS_NO_ACCESS_MESSAGE)).toBeTruthy();
    expect(queryByText('Alice Applicant')).toBeNull();
  });

  it('offers a retry, never a refusal, when the tier could not be read', () => {
    mockAccess = 'error';
    const { getByTestId, getByText, queryByText } = render(<Screen />);
    expect(mockUseHouseApplications).not.toHaveBeenCalledWith('house-1', true);
    expect(getByText(APPLICATIONS_ACCESS_ERROR_MESSAGE)).toBeTruthy();
    expect(queryByText(APPLICATIONS_NO_ACCESS_MESSAGE)).toBeNull();
    fireEvent.press(getByTestId('applications-access-retry'));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('waits, reading nothing, while the tier loads', () => {
    mockAccess = 'checking';
    const { getByTestId, queryByText } = render(<Screen />);
    expect(mockUseHouseApplications).not.toHaveBeenCalledWith('house-1', true);
    expect(getByTestId('loading-indicator')).toBeTruthy();
    expect(queryByText('Alice Applicant')).toBeNull();
  });
});
