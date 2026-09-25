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
import { dateInputToIso, nairaInputToKobo } from '../lib/transactions';
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

const nextAmountNaira = '1500000.50';
const nextDueOn = '2027-09-01';
const nextAmountKobo = 150_000_050;

const savedGoal: Goal = {
  ...activeGoal,
  amountTotalKobo: nextAmountKobo,
  dueDate: dateInputToIso(nextDueOn) as string,
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

describe('goal screen edit amount and due date', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockGetActiveGoal.mockResolvedValue(activeGoal);
    mockListGoals.mockResolvedValue([activeGoal]);
    jest.mocked(createGoal).mockResolvedValue(activeGoal);
    jest.mocked(endGoal).mockResolvedValue(activeGoal);
    mockUpdateGoal.mockResolvedValue(savedGoal);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('saves the edited target amount and due date instead of the seeded server values', async () => {
    await renderScreen();
    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit goal' }));
    expect(screen.getByLabelText('Goal target amount in naira')).toHaveProp(
      'value',
      '1200000',
    );
    expect(screen.getByLabelText('Goal due date')).toHaveProp(
      'value',
      '2027-08-20',
    );

    await fireEvent.changeText(
      screen.getByLabelText('Goal target amount in naira'),
      nextAmountNaira,
    );
    await fireEvent.changeText(
      screen.getByLabelText('Goal due date'),
      nextDueOn,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Goal target amount in naira')).toHaveProp(
        'value',
        nextAmountNaira,
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Goal due date')).toHaveProp(
        'value',
        nextDueOn,
      ),
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();

    mockGetActiveGoal.mockResolvedValue(savedGoal);
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await settle();

    expect(nairaInputToKobo(nextAmountNaira)).toBe(nextAmountKobo);
    expect(mockUpdateGoal).toHaveBeenCalledWith('goal_active', {
      name: 'Annual rent',
      amountTotalKobo: nextAmountKobo,
      dueDate: dateInputToIso(nextDueOn),
      monthlyIncomeKobo: 500_000_00,
    });
    expect(mockUpdateGoal).not.toHaveBeenCalledWith(
      'goal_active',
      expect.objectContaining({
        amountTotalKobo: 1_200_000_00,
        dueDate: '2027-08-20T12:00:00.000Z',
      }),
    );
    expect(await screen.findByText('Goal changes saved')).toBeOnTheScreen();
  });
});
