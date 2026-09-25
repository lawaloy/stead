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
import { dateInputToIso } from '../lib/transactions';
import { queryClient } from '../lib/query-client';

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

const createdGoal: Goal = {
  id: 'goal_created',
  userId: 'user_1',
  name: 'School fees',
  amountTotalKobo: 75_000_000,
  dueDate: '2027-09-01T12:00:00.000Z',
  monthlyIncomeKobo: 30_000_000,
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

const settle = async () => {
  await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
};

describe('goal screen create with monthly income', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockGetActiveGoal.mockResolvedValue(null);
    mockListGoals.mockResolvedValue([]);
    mockCreateGoal.mockResolvedValue(createdGoal);
    jest.mocked(updateGoal).mockResolvedValue(createdGoal);
    jest.mocked(endGoal).mockResolvedValue(createdGoal);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('includes monthlyIncomeKobo when creating a goal with optional income', async () => {
    await renderScreen();

    expect(
      await screen.findByRole('header', { name: 'Create a goal' }),
    ).toBeOnTheScreen();
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
    await fireEvent.changeText(
      screen.getByLabelText('Monthly income in naira'),
      '300000',
    );
    mockGetActiveGoal.mockResolvedValue(createdGoal);
    await fireEvent.press(screen.getByRole('button', { name: 'Create goal' }));
    await settle();

    expect(mockCreateGoal).toHaveBeenCalledWith({
      name: 'School fees',
      amountTotalKobo: 75_000_000,
      dueDate: dateInputToIso('2027-09-01'),
      monthlyIncomeKobo: 30_000_000,
    });
    expect(await screen.findByText('Goal created')).toBeOnTheScreen();
    expect(await screen.findByText('School fees')).toBeOnTheScreen();
  });
});
