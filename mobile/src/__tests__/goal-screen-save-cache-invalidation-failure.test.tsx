import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
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
import { ApiError } from '../lib/api-error';
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

const mockUpdateGoal = jest.mocked(updateGoal);
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

const dashboardCache = { ok: true, metrics: { stabilityScore: 80 } };

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

describe('goal screen save cache invalidation failure', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockGetActiveGoal.mockResolvedValue(activeGoal);
    mockListGoals.mockResolvedValue([activeGoal]);
    jest.mocked(createGoal).mockResolvedValue(activeGoal);
    jest.mocked(endGoal).mockResolvedValue(activeGoal);
    mockUpdateGoal.mockRejectedValue(
      new ApiError({ message: 'Goal could not be saved', status: 503 }),
    );
    queryClient.setQueryData(
      sessionQueryKeys.dashboard('session-token'),
      dashboardCache,
    );
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

  it('does not refresh goal or dashboard caches when save is rejected', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    await renderScreen();
    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();
    await settle();
    const dashboardBefore = queryClient.getQueryData(
      sessionQueryKeys.dashboard('session-token'),
    );
    const activeGoalBefore = queryClient.getQueryData(
      sessionQueryKeys.activeGoal('session-token'),
    );
    const historyBefore = queryClient.getQueryData(
      sessionQueryKeys.goalHistory('session-token'),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Edit goal' }));
    await fireEvent.changeText(screen.getByLabelText('Goal name'), 'Rent 2027');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await settle();

    expect(
      await screen.findByRole('alert', { name: 'Goal could not be saved' }),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Goal changes saved')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toBeOnTheScreen();
    expect(mockUpdateGoal).toHaveBeenCalledWith('goal_active', {
      name: 'Rent 2027',
      amountTotalKobo: 1_200_000_00,
      dueDate: '2027-08-20T12:00:00.000Z',
      monthlyIncomeKobo: 500_000_00,
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData(sessionQueryKeys.dashboard('session-token')),
    ).toEqual(dashboardBefore);
    expect(dashboardBefore).toEqual(dashboardCache);
    expect(
      queryClient.getQueryData(sessionQueryKeys.activeGoal('session-token')),
    ).toEqual(activeGoalBefore);
    expect(activeGoalBefore).toEqual(activeGoal);
    expect(
      queryClient.getQueryData(sessionQueryKeys.goalHistory('session-token')),
    ).toEqual(historyBefore);
    expect(
      queryClient.getQueryState(sessionQueryKeys.dashboard('session-token'))
        ?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(sessionQueryKeys.activeGoal('session-token'))
        ?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(sessionQueryKeys.goalHistory('session-token'))
        ?.isInvalidated,
    ).toBe(false);
  });
});
