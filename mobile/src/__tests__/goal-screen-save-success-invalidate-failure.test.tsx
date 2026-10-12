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
import { dateInputToIso } from '../lib/transactions';
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

const mockCreateGoal = jest.mocked(createGoal);
const mockGetActiveGoal = jest.mocked(getActiveGoal);
const mockListGoals = jest.mocked(listGoals);
const mockUpdateGoal = jest.mocked(updateGoal);

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

const editedGoal: Goal = {
  ...activeGoal,
  name: 'Rent 2027',
};

const createdGoal: Goal = {
  ...activeGoal,
  id: 'goal_created',
  name: 'School fees',
  amountTotalKobo: 75_000_000,
  dueDate: '2027-09-01T12:00:00.000Z',
  monthlyIncomeKobo: null,
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

describe('goal screen save success invalidate failure', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockGetActiveGoal.mockResolvedValue(activeGoal);
    mockListGoals.mockResolvedValue([activeGoal]);
    mockCreateGoal.mockResolvedValue(createdGoal);
    mockUpdateGoal.mockResolvedValue(editedGoal);
    jest.mocked(endGoal).mockResolvedValue(activeGoal);
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

  it('keeps the edited goal locally when history and dashboard refresh reject', async () => {
    const invalidateSpy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockRejectedValue(new Error('Failed to refresh goal caches'));
    await renderScreen();
    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();
    await settle();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit goal' }));
    await fireEvent.changeText(screen.getByLabelText('Goal name'), 'Rent 2027');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await settle();

    expect(mockUpdateGoal).toHaveBeenCalledWith('goal_active', {
      name: 'Rent 2027',
      amountTotalKobo: 1_200_000_00,
      dueDate: '2027-08-20T12:00:00.000Z',
      monthlyIncomeKobo: 500_000_00,
    });
    expect(await screen.findByText('Goal changes saved')).toBeOnTheScreen();
    expect(
      await screen.findByRole('alert', {
        name: 'Failed to refresh goal caches',
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Rent 2027')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit goal' })).toBeOnTheScreen();
    expect(invalidateSpy).toHaveBeenCalled();
    expect(
      queryClient.getQueryData(sessionQueryKeys.activeGoal('session-token')),
    ).toEqual(editedGoal);
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

  it('keeps the replacement goal locally when history and dashboard refresh reject', async () => {
    const invalidateSpy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockRejectedValue(new Error('Failed to refresh goal caches'));
    await renderScreen();
    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();
    await settle();

    await fireEvent.press(screen.getByRole('button', { name: 'Replace goal' }));
    await fireEvent.changeText(
      screen.getByLabelText('Goal name'),
      'School fees',
    );
    await fireEvent.changeText(
      screen.getByLabelText('Goal target amount in naira'),
      '750000',
    );
    await fireEvent.changeText(
      screen.getByLabelText('Goal due date'),
      '2027-09-01',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Create replacement' }),
    );

    const actions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    expect(mockCreateGoal).not.toHaveBeenCalled();
    await act(async () => {
      actions
        ?.find((action) => action.text === 'Start replacement')
        ?.onPress?.();
    });
    await settle();

    expect(mockCreateGoal).toHaveBeenCalledWith({
      name: 'School fees',
      amountTotalKobo: 75_000_000,
      dueDate: dateInputToIso('2027-09-01'),
    });
    expect(
      await screen.findByText('Replacement goal started'),
    ).toBeOnTheScreen();
    expect(
      await screen.findByRole('alert', {
        name: 'Failed to refresh goal caches',
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText('School fees')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: 'Create replacement' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Replace goal' }),
    ).toBeOnTheScreen();
    expect(invalidateSpy).toHaveBeenCalled();
    expect(
      queryClient.getQueryData(sessionQueryKeys.activeGoal('session-token')),
    ).toEqual(createdGoal);
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
