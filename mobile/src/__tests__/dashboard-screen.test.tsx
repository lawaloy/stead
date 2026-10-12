import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import DashboardScreen from '../../app/(app)/dashboard';
import type { DashboardStabilityResponse } from '../contracts/generated/types.gen';
import { getDashboardStability } from '../lib/api';
import { queryClient } from '../lib/query-client';

let onFocus: (() => void) | undefined;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    onFocus = effect;
  },
}));
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
    onFocus = undefined;
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

  it('refetches stability when the screen regains focus', async () => {
    let release!: (value: DashboardStabilityResponse) => void;
    mockDashboard.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await renderScreen();

    await act(async () => onFocus?.());
    expect(mockDashboard).toHaveBeenCalledTimes(1);

    await act(async () => release(stability));
    expect(await screen.findByText('17%')).toBeOnTheScreen();

    mockDashboard.mockResolvedValueOnce({
      ...stability,
      metrics: { ...stability.metrics, readinessPct: 20, stabilityScore: 16 },
    });
    await act(async () => onFocus?.());
    expect(await screen.findByText('20%')).toBeOnTheScreen();
    expect(screen.getByText('16')).toBeOnTheScreen();
    expect(mockDashboard).toHaveBeenCalledTimes(2);
  });

  it('keeps cached metrics when a focus refresh fails', async () => {
    await renderScreen();
    expect(await screen.findByText('17%')).toBeOnTheScreen();

    mockDashboard.mockRejectedValue(new Error('Offline'));
    await act(async () => {
      onFocus?.();
    });
    await waitFor(() => expect(mockDashboard).toHaveBeenCalledTimes(3), {
      timeout: 4_000,
    });
    await act(async () => {
      await Promise.allSettled(
        mockDashboard.mock.results.map((result) => result.value),
      );
    });

    expect(screen.getByText('Annual rent')).toBeOnTheScreen();
    expect(screen.getByText('17%')).toBeOnTheScreen();
    expect(
      screen.queryByText('Failed to load dashboard. Pull to retry.'),
    ).not.toBeOnTheScreen();
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
