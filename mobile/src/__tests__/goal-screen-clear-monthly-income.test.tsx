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

const clearedIncome: Goal = {
  ...activeGoal,
  monthlyIncomeKobo: null,
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

describe('goal screen monthly income clear', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockGetActiveGoal.mockResolvedValue(activeGoal);
    mockListGoals.mockResolvedValue([activeGoal]);
    jest.mocked(createGoal).mockResolvedValue(activeGoal);
    jest.mocked(endGoal).mockResolvedValue(activeGoal);
    mockUpdateGoal.mockResolvedValue(clearedIncome);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends monthlyIncomeKobo null when the optional income field is cleared', async () => {
    await renderScreen();
    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit goal' }));
    await fireEvent.changeText(
      screen.getByLabelText('Monthly income in naira'),
      '',
    );
    mockGetActiveGoal.mockResolvedValue(clearedIncome);
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await settle();

    expect(mockUpdateGoal).toHaveBeenCalledWith('goal_active', {
      name: 'Annual rent',
      amountTotalKobo: 1_200_000_00,
      dueDate: '2027-08-20T12:00:00.000Z',
      monthlyIncomeKobo: null,
    });
    expect(await screen.findByText('Goal changes saved')).toBeOnTheScreen();
  });
});
