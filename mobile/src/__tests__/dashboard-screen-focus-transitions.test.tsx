import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import DashboardScreen from '../../app/(app)/dashboard';
import type { DashboardStabilityResponse } from '../contracts/generated/types.gen';
import { getDashboardStability } from '../lib/api';
import { useAuth } from '../lib/auth-state';
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
  useAuth: jest.fn(),
}));
jest.mock('../lib/api', () => ({ getDashboardStability: jest.fn() }));

const mockAuth = jest.mocked(useAuth);
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
const missingGoal: DashboardStabilityResponse = {
  ok: false,
  message: 'No active goal found',
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardScreen />
    </QueryClientProvider>,
  );

describe('stability dashboard focus transitions', () => {
  beforeEach(() => {
    onFocus = undefined;
    queryClient.clear();
    jest.clearAllMocks();
    mockAuth.mockReturnValue({ token: 'session-token' } as never);
    mockDashboard.mockResolvedValue(stability);
  });

  it('paints new goal metrics after a focus refetch from a missing-goal cache', async () => {
    mockDashboard.mockResolvedValueOnce(missingGoal);
    await renderScreen();
    expect(await screen.findByText('No active goal found')).toBeOnTheScreen();
    expect(screen.queryByText('Readiness')).not.toBeOnTheScreen();

    mockDashboard.mockResolvedValueOnce(stability);
    await act(async () => onFocus?.());

    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();
    expect(screen.getByText('17%')).toBeOnTheScreen();
    expect(screen.queryByText('No active goal found')).not.toBeOnTheScreen();
  });

  it('replaces cached metrics with the missing-goal state after a successful focus refetch', async () => {
    await renderScreen();
    expect(await screen.findByText('17%')).toBeOnTheScreen();
    expect(screen.getByText('Annual rent')).toBeOnTheScreen();

    mockDashboard.mockResolvedValueOnce(missingGoal);
    await act(async () => onFocus?.());

    expect(await screen.findByText('No active goal found')).toBeOnTheScreen();
    expect(screen.queryByText('Readiness')).not.toBeOnTheScreen();
    expect(screen.queryByText('17%')).not.toBeOnTheScreen();
    expect(screen.queryByText('Annual rent')).not.toBeOnTheScreen();
  });

  it('recovers from an initial load failure when the screen regains focus', async () => {
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
    await act(async () => onFocus?.());

    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();
    expect(screen.getByText('17%')).toBeOnTheScreen();
    expect(
      screen.queryByText('Failed to load dashboard. Pull to retry.'),
    ).not.toBeOnTheScreen();
  });

  it('does not fetch stability while the session has no token, including on focus', async () => {
    mockAuth.mockReturnValue({ token: null } as never);
    await renderScreen();
    await act(async () => onFocus?.());

    expect(mockDashboard).not.toHaveBeenCalled();
  });
});
