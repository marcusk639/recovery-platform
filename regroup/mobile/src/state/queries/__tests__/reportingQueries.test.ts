import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  reportingKeys,
  useOccupancyReport,
  useComplianceTrend,
  useDischargeReport,
} from '../reportingQueries';
import * as reportingService from '../../../services/reportingService';
import * as logging from '../../../util/logging';

jest.mock('../../../services/reportingService', () => ({
  getOccupancyReport: jest.fn(),
  getComplianceTrend: jest.fn(),
  getDischargeReport: jest.fn(),
}));

jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return Wrapper;
};

const mockGetOccupancyReport = reportingService.getOccupancyReport as jest.Mock;
const mockGetComplianceTrend = reportingService.getComplianceTrend as jest.Mock;
const mockGetDischargeReport = reportingService.getDischargeReport as jest.Mock;
const mockLogException = logging.logException as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// reportingKeys tests
describe('reportingKeys', () => {
  it('occupancy keys are distinct for different houses', () => {
    const key1 = reportingKeys.occupancy('h1');
    const key2 = reportingKeys.occupancy('h2');
    expect(key1).not.toEqual(key2);
  });

  it('discharge keys are distinct for different periods', () => {
    const key1 = reportingKeys.discharge('h1', 30);
    const key2 = reportingKeys.discharge('h1', 60);
    expect(key1).not.toEqual(key2);
  });
});

// useOccupancyReport tests
describe('useOccupancyReport', () => {
  it('returns data on success', async () => {
    const mockData = { occupancyRate: 0.8, occupiedBeds: 8, totalBeds: 10 };
    mockGetOccupancyReport.mockResolvedValue(mockData);

    const { result } = renderHook(() => useOccupancyReport('house1', [], 10), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });

  it('is idle when houseId is empty', () => {
    const { result } = renderHook(() => useOccupancyReport('', [], 10), {
      wrapper: makeWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });

  it('calls logException on error', async () => {
    const error = new Error('fetch failed');
    mockGetOccupancyReport.mockRejectedValue(error);

    const { result } = renderHook(() => useOccupancyReport('house1', [], 10), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockLogException).toHaveBeenCalledWith(error);
  });
});

// useComplianceTrend tests
describe('useComplianceTrend', () => {
  it('returns compliance data on success', async () => {
    const mockData = { weeks: [{ week: 1, rate: 0.9 }] };
    mockGetComplianceTrend.mockResolvedValue(mockData);

    const { result } = renderHook(
      () => useComplianceTrend('house1', ['g1', 'g2'], 4),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });

  it('is idle when guestIds is empty', () => {
    const { result } = renderHook(() => useComplianceTrend('house1', [], 4), {
      wrapper: makeWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });

  it('calls logException on error', async () => {
    const error = new Error('compliance fetch failed');
    mockGetComplianceTrend.mockRejectedValue(error);

    const { result } = renderHook(
      () => useComplianceTrend('house1', ['g1'], 4),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockLogException).toHaveBeenCalledWith(error);
  });
});

// useDischargeReport tests
describe('useDischargeReport', () => {
  it('returns discharge data on success', async () => {
    const mockData = { discharges: [], totalDischarges: 0 };
    mockGetDischargeReport.mockResolvedValue(mockData);

    const { result } = renderHook(() => useDischargeReport('house1', []), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });

  it('uses default daysBack of 30', async () => {
    const mockData = { discharges: [], totalDischarges: 0 };
    mockGetDischargeReport.mockResolvedValue(mockData);

    const { result } = renderHook(() => useDischargeReport('house1', []), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetDischargeReport).toHaveBeenCalledWith('house1', [], 30);
  });

  it('calls logException on error', async () => {
    const error = new Error('discharge fetch failed');
    mockGetDischargeReport.mockRejectedValue(error);

    const { result } = renderHook(() => useDischargeReport('house1', []), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockLogException).toHaveBeenCalledWith(error);
  });
});
