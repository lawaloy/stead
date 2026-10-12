import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
import GoalScreen from '../../app/(app)/goal';
import type { Goal } from '../contracts/generated/types.gen';
import {
  createGoal,
  endGoal,
  getActiveGoal,
  listGoals,
  updateGoal,
} from '../lib/api';
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

jest.mock('../lib/api', () => {
  const { ApiError: ActualApiError } = jest.requireActual('../lib/api-error');
  return {
    ApiError: ActualApiError,
    createGoal: jest.fn(),
    endGoal: jest.fn(),
    getActiveGoal: jest.fn(),
    listGoals: jest.fn(),
    updateGoal: jest.fn(),
  };
});

const mockEndGoal = jest.mocked(endGoal);
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

const completedGoal: Goal = {
  ...activeGoal,
  isActive: false,
  status: 'completed',
  endedAt: '2026-09-25T12:00:00.000Z',
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <GoalScreen />
    </QueryClientProvider>,
  );

const settle = async () => {
  await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
};

describe('goal screen end cache invalidation', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockGetActiveGoal.mockResolvedValue(activeGoal);
    mockListGoals.mockResolvedValue([activeGoal]);
    jest.mocked(createGoal).mockResolvedValue(activeGoal);
    jest.mocked(updateGoal).mockResolvedValue(activeGoal);
    mockEndGoal.mockResolvedValue(completedGoal);
    queryClient.setQueryData(sessionQueryKeys.dashboard('session-token'), {
      ok: true,
      metrics: { stabilityScore: 80 },
    });
    queryClient.setQueryData(
      sessionQueryKeys.activeGoal('session-token'),
      activeGoal,
    );
    queryClient.setQueryData(sessionQueryKeys.goalHistory('session-token'), [
      activeGoal,
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('invalidates dashboard, active goal, and goal history after a successful complete', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    await renderScreen();
    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Mark completed' }),
    );
    const actions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    mockGetActiveGoal.mockResolvedValue(null);
    mockListGoals.mockResolvedValue([completedGoal]);
    await act(async () => {
      actions?.find((action) => action.text === 'Mark completed')?.onPress?.();
    });
    await settle();

    expect(mockEndGoal).toHaveBeenCalledWith('goal_active', {
      status: 'completed',
    });
    expect(await screen.findByText('Goal marked completed')).toBeOnTheScreen();
    expect(
      queryClient.getQueryData(sessionQueryKeys.activeGoal('session-token')),
    ).toBeNull();
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['goal', 'active'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['goals', 'history'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['dashboard', 'stability'],
      });
    });
  });
});
