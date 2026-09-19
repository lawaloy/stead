import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
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

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardScreen />
    </QueryClientProvider>,
  );

describe('stability dashboard screen', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockDashboard.mockResolvedValue(stability);
  });

  it('shows loading, populated metrics, and recalculates after refresh', async () => {
    let release!: (value: DashboardStabilityResponse) => void;
    mockDashboard.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await renderScreen();
    expect(screen.getByText('Loading stability metrics...')).toBeOnTheScreen();

    await act(async () => release(stability));
    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();
    expect(screen.getByText('WARNING')).toBeOnTheScreen();
    expect(screen.getByText('17%')).toBeOnTheScreen();
    expect(screen.getByText('65')).toBeOnTheScreen();

    mockDashboard.mockResolvedValueOnce({
      ...stability,
      metrics: { ...stability.metrics, readinessPct: 25, stabilityScore: 71 },
    });
    const refresh = screen.getByTestId('dashboard-refresh').props
      .refreshControl as React.ReactElement<{ onRefresh: () => void }>;
    await act(async () => refresh.props.onRefresh());
    expect(await screen.findByText('25%')).toBeOnTheScreen();
    expect(screen.getByText('71')).toBeOnTheScreen();
  });

  it('shows a missing-goal state instead of fabricated metrics', async () => {
    mockDashboard.mockResolvedValue({
      ok: false,
      message: 'No active goal found',
    });
    await renderScreen();

    expect(await screen.findByText('No active goal found')).toBeOnTheScreen();
    expect(screen.queryByText('Readiness')).not.toBeOnTheScreen();
  });

  it('shows a failed-read state and supports retry by pulling to refresh', async () => {
    mockDashboard.mockRejectedValue(new Error('Offline'));
    await renderScreen();
    expect(
      await screen.findByText(
        'Failed to load dashboard. Pull to retry.',
        {},
        { timeout: 3_000 },
      ),
    ).toBeOnTheScreen();

    mockDashboard.mockResolvedValue(stability);
    const refresh = screen.getByTestId('dashboard-refresh').props
      .refreshControl as React.ReactElement<{ onRefresh: () => void }>;
    await act(async () => refresh.props.onRefresh());
    await waitFor(() =>
      expect(screen.getByText('Annual rent')).toBeOnTheScreen(),
    );
  });
});
