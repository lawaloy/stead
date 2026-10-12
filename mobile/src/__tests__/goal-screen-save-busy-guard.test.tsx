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
  monthlyIncomeKobo: null,
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

describe('goal screen save busy guard', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockGetActiveGoal.mockResolvedValue(null);
    mockListGoals.mockResolvedValue([]);
    jest.mocked(updateGoal).mockResolvedValue(createdGoal);
    jest.mocked(endGoal).mockResolvedValue(createdGoal);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('disables save and shows Saving while create is in flight', async () => {
    let resolveCreate: ((value: Goal) => void) | undefined;
    mockCreateGoal.mockImplementation(
      () =>
        new Promise<Goal>((resolve) => {
          resolveCreate = resolve;
        }),
    );

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

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Create goal' }));
    });

    await waitFor(() => expect(mockCreateGoal).toHaveBeenCalledTimes(1));
    expect(mockCreateGoal).toHaveBeenCalledWith({
      name: 'School fees',
      amountTotalKobo: 75_000_000,
      dueDate: dateInputToIso('2027-09-01'),
    });
    expect(await screen.findByText('Saving...')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.queryByText('Goal created')).toBeNull();

    mockGetActiveGoal.mockResolvedValue(createdGoal);
    await act(async () => {
      resolveCreate?.(createdGoal);
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(await screen.findByText('Goal created')).toBeOnTheScreen();
    expect(mockCreateGoal).toHaveBeenCalledTimes(1);
  });
});
