/** The Payment Dashboard's rent-collection ROI card (#32). */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../../../state/queries/rentRoiQueries', () => ({ useRentRoiMetrics: jest.fn() }));

import RentRoiCard from '../RentRoiCard';
import { useRentRoiMetrics } from '../../../state/queries/rentRoiQueries';

const mockQuery = useRentRoiMetrics as jest.Mock;

const metrics = {
  available: true,
  collectedNetCents: 125000,
  outstandingCents: 30050,
  onTimeRatePct: 80,
  paymentCount: 4,
  automatedCollectionCount: 3,
  minutesSavedPerCollection: 10,
  hoursSavedEstimate: 0.5,
  caveats: [],
};

describe('RentRoiCard', () => {
  it('shows collected, on-time, outstanding and the hours-saved estimate', () => {
    mockQuery.mockReturnValue({ data: metrics, error: null });
    const { getByTestId, getByText } = render(<RentRoiCard houseId="h1" startAt="2026-11-01T05:00:00.000Z" />);

    expect(mockQuery).toHaveBeenCalledWith('h1', '2026-11-01T05:00:00.000Z');
    expect(getByTestId('rent-roi-collected')).toHaveTextContent('$1,250.00Collected');
    expect(getByTestId('rent-roi-on-time')).toHaveTextContent('80%On time');
    expect(getByTestId('rent-roi-outstanding')).toHaveTextContent('$300.50Outstanding now');
    expect(getByTestId('rent-roi-hours')).toHaveTextContent('0.5Hours saved (est.)');
    expect(
      getByText(
        'Hours saved is an estimate: 10 minutes for each payment collected through Stripe (3 in this period).',
      ),
    ).toBeTruthy();
  });

  it('shows a dash for on-time when no payment had a due date', () => {
    mockQuery.mockReturnValue({ data: { ...metrics, onTimeRatePct: null }, error: null });
    const { getByTestId } = render(<RentRoiCard houseId="h1" />);
    expect(getByTestId('rent-roi-on-time')).toHaveTextContent('—On time');
  });

  it("shows nothing when the plan doesn't include analytics", () => {
    mockQuery.mockReturnValue({
      data: { available: false, status: 'upgrade_required', message: 'Upgrade' },
      error: null,
    });
    const { toJSON } = render(<RentRoiCard houseId="h1" />);
    expect(toJSON()).toBeNull();
  });

  it('shows nothing while loading', () => {
    mockQuery.mockReturnValue({ data: undefined, error: null });
    const { toJSON } = render(<RentRoiCard houseId="h1" />);
    expect(toJSON()).toBeNull();
  });

  it('shows nothing to staff the server refuses (the owner only)', () => {
    mockQuery.mockReturnValue({
      data: undefined,
      error: Object.assign(new Error('denied'), { code: 'functions/permission-denied' }),
    });
    const { toJSON } = render(<RentRoiCard houseId="h1" />);
    expect(toJSON()).toBeNull();
  });

  it('says so when the metrics fail to load for another reason', () => {
    mockQuery.mockReturnValue({
      data: undefined,
      error: Object.assign(new Error('unavailable'), { code: 'functions/unavailable' }),
    });
    const { getByTestId } = render(<RentRoiCard houseId="h1" />);
    expect(getByTestId('rent-roi-error')).toHaveTextContent("Couldn't load rent collection ROI.");
  });
});
