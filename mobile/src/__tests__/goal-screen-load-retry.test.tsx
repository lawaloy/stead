import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import GoalScreen from '../../app/(app)/goal';
import type { Goal } from '../contracts/generated/types.gen';
import { getActiveGoal, listGoals } from '../lib/api';
import { queryClient } from '../lib/query-client';
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

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <GoalScreen />
    </QueryClientProvider>,
  );

describe('goal screen load failure', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockListGoals.mockResolvedValue([activeGoal]);
  });

  it('keeps the last-saved active goal visible when a background refresh fails', async () => {
    queryClient.setQueryData(
      sessionQueryKeys.activeGoal('session-token'),
      activeGoal,
      { updatedAt: 0 },
    );
    mockGetActiveGoal.mockRejectedValue(new Error('Offline'));
    await renderScreen();

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
    expect(
      screen.queryByRole('header', { name: 'Create a goal' }),
    ).not.toBeOnTheScreen();
    expect(screen.queryByText('No active goal yet.')).not.toBeOnTheScreen();

    mockGetActiveGoal.mockResolvedValue(activeGoal);
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(
        screen.queryByText(
          'Could not load your current goal. Check your connection and retry.',
        ),
      ).not.toBeOnTheScreen(),
    );
    expect(screen.getByText('Annual rent')).toBeOnTheScreen();
  });
});
