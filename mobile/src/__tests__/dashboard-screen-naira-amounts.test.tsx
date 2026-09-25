import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import DashboardScreen from '../../app/(app)/dashboard';
import type { DashboardStabilityResponse } from '../contracts/generated/types.gen';
import { getDashboardStability } from '../lib/api';
import { queryClient } from '../lib/query-client';

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement('View', null, children),
  };
});
jest.mock('../lib/auth-state', () => ({
  useAuth: () => ({ token: 'session-token' }),
}));
jest.mock('../lib/api', () => ({ getDashboardStability: jest.fn() }));

const mockDashboard = jest.mocked(getDashboardStability);
const stability: DashboardStabilityResponse = {
  ok: true,
  goal: {
    id: 'goal_1',
    name: 'Annual rent',
    amountTotalKobo: 120_000_000,
    dueDate: '2027-08-20T12:00:00.000Z',
    monthlyIncomeKobo: null,
  },
  metrics: {
    daysRemaining: 340,
    remainingObligationKobo: 100_000_000,
    readinessPct: 17,
    paceRequiredMonthlyKobo: 9_000_000,
    safeToSpendKobo: 5_000_000,
    stabilityScore: 65,
    status: 'warning',
    goalSavedKobo: 20_000_000,
    estimatedBalanceKobo: 25_000_000,
  },
};

const koboToNaira = (kobo: number) => `₦${(kobo / 100).toLocaleString()}`;

describe('stability dashboard naira amounts', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockDashboard.mockResolvedValue(stability);
  });

  it('converts kobo metrics to naira instead of showing raw ledger units', async () => {
    await render(
      <QueryClientProvider client={queryClient}>
        <DashboardScreen />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();
    expect(
      screen.getByText(`Target: ${koboToNaira(120_000_000)}`),
    ).toBeOnTheScreen();
    expect(screen.getByText(koboToNaira(5_000_000))).toBeOnTheScreen();
    expect(screen.getByText(koboToNaira(9_000_000))).toBeOnTheScreen();
    expect(screen.queryByText('120000000')).toBeNull();
    expect(screen.queryByText('5000000')).toBeNull();
    expect(screen.queryByText('9000000')).toBeNull();
  });
});
