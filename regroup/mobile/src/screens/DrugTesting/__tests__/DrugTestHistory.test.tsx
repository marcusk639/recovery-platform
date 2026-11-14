// The history screen scopes its queries to the house (#197).
import React from 'react';
import { render } from '@testing-library/react-native';
import DrugTestHistory from '../DrugTestHistory';

const mockUseGuestDrugTests = jest.fn((..._args: any[]): any => ({ data: [], isLoading: false }));
const mockUsePositiveTestCount = jest.fn((..._args: any[]): any => ({ data: 0, isLoading: false }));
jest.mock('../../../state/queries/drugTestQueries', () => ({
  useGuestDrugTests: (...args: any[]) => mockUseGuestDrugTests(...args),
  usePositiveTestCount: (...args: any[]) => mockUsePositiveTestCount(...args),
}));

jest.mock('../../../components/rats-text/rats-text', () => {
  const { Text } = require('react-native');
  return ({ text }: any) => <Text>{String(text ?? '')}</Text>;
});
jest.mock('../../../components/rats-loading-indicator/rats-loading-indicator', () => {
  const { View } = require('react-native');
  return () => <View testID="rats-loading-indicator" />;
});
jest.mock('../../../components/screen-header', () => {
  const { View } = require('react-native');
  return () => <View testID="screen-header" />;
});
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { guestId: 'g1', houseId: 'h1' } }),
}));

describe('DrugTestHistory', () => {
  it("queries the resident's tests within the house (#197)", () => {
    render(<DrugTestHistory />);
    expect(mockUseGuestDrugTests).toHaveBeenCalledWith('h1', 'g1');
    expect(mockUsePositiveTestCount).toHaveBeenCalledWith('h1', 'g1');
  });
});
