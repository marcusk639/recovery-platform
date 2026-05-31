/**
 * Tests for GuestComplianceDot component
 *
 * GuestComplianceDot is a thin wrapper that calls useComplianceCheck and
 * passes the resulting status to ComplianceDot.  We mock the hook so we
 * can test every status branch without hitting Firestore.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import GuestComplianceDot from '../GuestComplianceDot';

// Mock the query hook so we control the status
jest.mock('../../../state/queries/activityQueries', () => ({
  useComplianceCheck: jest.fn(),
  useWeekSummary: jest.fn(() => ({ data: null, isLoading: false, isError: false, error: null })),
}));

import { useComplianceCheck } from '../../../state/queries/activityQueries';

const mockGuest: any = {
  id: 'guest-1',
  phase: '1',
  firstName: 'John',
  lastName: 'Doe',
};

const mockHouse: any = {
  id: 'house-1',
  name: 'Test House',
  phases: {},
};

describe('GuestComplianceDot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    (useComplianceCheck as jest.Mock).mockReturnValue({ status: 'loading' });
    const { toJSON } = render(
      <GuestComplianceDot
        guest={mockGuest}
        house={mockHouse}
        weekStart="2026-02-17"
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders a loading dot when status is loading', () => {
    (useComplianceCheck as jest.Mock).mockReturnValue({ status: 'loading' });
    const { getByTestId } = render(
      <GuestComplianceDot
        guest={mockGuest}
        house={mockHouse}
        weekStart="2026-02-17"
      />,
    );
    expect(getByTestId('compliance-dot-loading')).toBeTruthy();
  });

  it('renders a compliant dot when status is compliant', () => {
    (useComplianceCheck as jest.Mock).mockReturnValue({ status: 'compliant' });
    const { getByTestId } = render(
      <GuestComplianceDot
        guest={mockGuest}
        house={mockHouse}
        weekStart="2026-02-17"
      />,
    );
    expect(getByTestId('compliance-dot-compliant')).toBeTruthy();
  });

  it('renders a non-compliant dot when status is non-compliant', () => {
    (useComplianceCheck as jest.Mock).mockReturnValue({
      status: 'non-compliant',
    });
    const { getByTestId } = render(
      <GuestComplianceDot
        guest={mockGuest}
        house={mockHouse}
        weekStart="2026-02-17"
      />,
    );
    expect(getByTestId('compliance-dot-non-compliant')).toBeTruthy();
  });

  it('renders an incomplete-data dot when status is incomplete-data', () => {
    (useComplianceCheck as jest.Mock).mockReturnValue({
      status: 'incomplete-data',
    });
    const { getByTestId } = render(
      <GuestComplianceDot
        guest={mockGuest}
        house={mockHouse}
        weekStart="2026-02-17"
      />,
    );
    expect(getByTestId('compliance-dot-incomplete-data')).toBeTruthy();
  });

  it('passes custom testID to the underlying ComplianceDot', () => {
    (useComplianceCheck as jest.Mock).mockReturnValue({ status: 'compliant' });
    const { getByTestId } = render(
      <GuestComplianceDot
        guest={mockGuest}
        house={mockHouse}
        weekStart="2026-02-17"
        testID="custom-dot"
      />,
    );
    expect(getByTestId('custom-dot')).toBeTruthy();
  });

  it('calls useComplianceCheck with correct arguments', () => {
    (useComplianceCheck as jest.Mock).mockReturnValue({ status: 'loading' });
    render(
      <GuestComplianceDot
        guest={mockGuest}
        house={mockHouse}
        weekStart="2026-02-17"
      />,
    );
    expect(useComplianceCheck).toHaveBeenCalledWith(
      mockGuest,
      '2026-02-17',
      mockHouse,
    );
  });

  it('re-renders when weekStart changes', () => {
    (useComplianceCheck as jest.Mock).mockReturnValue({ status: 'loading' });
    const { rerender, getByTestId } = render(
      <GuestComplianceDot
        guest={mockGuest}
        house={mockHouse}
        weekStart="2026-02-10"
      />,
    );
    expect(getByTestId('compliance-dot-loading')).toBeTruthy();

    (useComplianceCheck as jest.Mock).mockReturnValue({ status: 'compliant' });
    rerender(
      <GuestComplianceDot
        guest={mockGuest}
        house={mockHouse}
        weekStart="2026-02-17"
      />,
    );
    expect(getByTestId('compliance-dot-compliant')).toBeTruthy();
  });
});
