import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import DashboardScreen from '../../app/(app)/dashboard';
import type { DashboardStabilityResponse } from '../contracts/generated/types.gen';
import { getDashboardStability } from '../lib/api';
import { sessionQueryKeys } from '../lib/session-query-cache';

jest.mock('expo-router', () => ({
  useFocusEffect: () => undefined,
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

const renderScreen = (client: QueryClient) =>
  render(
    <QueryClientProvider client={client}>
      <DashboardScreen />
    </QueryClientProvider>,
  );

describe('dashboard screen retry busy guard', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await client.cancelQueries();
    client.clear();
  });

  it('disables retry while a background dashboard refresh is in flight', async () => {
    client.setQueryData(
      sessionQueryKeys.dashboard('session-token'),
      stability,
      { updatedAt: 0 },
    );
    mockDashboard.mockRejectedValue(new Error('Offline'));
    await renderScreen(client);

    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();
    expect(
      await screen.findByRole(
        'alert',
        {
          name: 'Could not refresh dashboard. Showing your last saved metrics.',
        },
        { timeout: 3_000 },
      ),
    ).toBeOnTheScreen();

    mockDashboard.mockImplementation(() => new Promise(() => undefined));
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole(
        'button',
        { name: 'Retrying...' },
        { timeout: 3_000 },
      ),
    ).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByText('Annual rent')).toBeOnTheScreen();
    expect(screen.getByText('17%')).toBeOnTheScreen();
  });
});
