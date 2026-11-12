import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import GoalScreen from '../../app/(app)/goal';
import type { Goal } from '../contracts/generated/types.gen';
import {
  createGoal,
  endGoal,
  getActiveGoal,
  listGoals,
  updateGoal,
} from '../lib/api';
import { sessionQueryKeys } from '../lib/session-query-cache';

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    Link: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

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

jest.mock('../lib/api', () => ({
  createGoal: jest.fn(),
  endGoal: jest.fn(),
  getActiveGoal: jest.fn(),
  listGoals: jest.fn(),
  updateGoal: jest.fn(),
}));

const mockGetActiveGoal = jest.mocked(getActiveGoal);
const mockListGoals = jest.mocked(listGoals);

const activeGoal: Goal = {
  id: 'goal_active',
  userId: 'user_1',
  name: 'Annual rent',
  amountTotalKobo: 1_200_000_00,
  dueDate: '2027-08-20T12:00:00.000Z',
  monthlyIncomeKobo: 500_000_00,
  isActive: true,
  status: 'active',
  endedAt: null,
  createdAt: '2026-08-20T12:00:00.000Z',
};

const renderScreen = (client: QueryClient) =>
  render(
    <QueryClientProvider client={client}>
      <GoalScreen />
    </QueryClientProvider>,
  );

describe('goal screen retry busy guard', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();
    mockListGoals.mockResolvedValue([activeGoal]);
    jest.mocked(createGoal).mockResolvedValue(activeGoal);
    jest.mocked(endGoal).mockResolvedValue(activeGoal);
    jest.mocked(updateGoal).mockResolvedValue(activeGoal);
  });

  afterEach(async () => {
    await client.cancelQueries();
    client.clear();
  });

  it('disables retry while a background active-goal refresh is in flight', async () => {
    client.setQueryData(
      sessionQueryKeys.activeGoal('session-token'),
      activeGoal,
      { updatedAt: 0 },
    );
    mockGetActiveGoal.mockRejectedValue(new Error('Offline'));
    await renderScreen(client);

    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();
    expect(
      await screen.findByRole(
        'alert',
        {
          name: 'Could not load your current goal. Check your connection and retry.',
        },
        { timeout: 3_000 },
      ),
    ).toBeOnTheScreen();

    mockGetActiveGoal.mockImplementation(() => new Promise(() => undefined));
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
  });
});
