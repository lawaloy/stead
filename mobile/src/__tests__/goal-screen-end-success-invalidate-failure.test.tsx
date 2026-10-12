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

describe('goal screen end success invalidate failure', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockGetActiveGoal.mockResolvedValue(activeGoal);
    mockListGoals.mockResolvedValue([activeGoal]);
    jest.mocked(createGoal).mockResolvedValue(activeGoal);
    jest.mocked(updateGoal).mockResolvedValue(activeGoal);
    mockEndGoal.mockResolvedValue(completedGoal);
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

  it('clears the active goal locally when history and dashboard refresh reject', async () => {
    const invalidateSpy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockRejectedValue(new Error('Failed to refresh goal caches'));
    await renderScreen();
    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();
    await settle();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Mark completed' }),
    );
    const actions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    await act(async () => {
      actions?.find((action) => action.text === 'Mark completed')?.onPress?.();
    });
    await settle();

    expect(mockEndGoal).toHaveBeenCalledWith('goal_active', {
      status: 'completed',
    });
    expect(await screen.findByText('Goal marked completed')).toBeOnTheScreen();
    expect(
      await screen.findByRole('alert', {
        name: 'Failed to refresh goal caches',
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText('No active goal yet.')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'Create a goal' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('Completed, cancelled, and replaced goals appear here.'),
    ).toBeOnTheScreen();
    expect(invalidateSpy).toHaveBeenCalled();
    expect(
      queryClient.getQueryData(sessionQueryKeys.activeGoal('session-token')),
    ).toBeNull();
    expect(
      queryClient.getQueryData(sessionQueryKeys.goalHistory('session-token')),
    ).toEqual([activeGoal]);
    expect(
      queryClient.getQueryData(sessionQueryKeys.dashboard('session-token')),
    ).toEqual(dashboardCache);
    expect(
      queryClient.getQueryState(sessionQueryKeys.dashboard('session-token'))
        ?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(sessionQueryKeys.goalHistory('session-token'))
        ?.isInvalidated,
    ).toBe(false);
  });
});
