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
  ApiError,
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

const mockCreateGoal = jest.mocked(createGoal);
const mockEndGoal = jest.mocked(endGoal);
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

const replacedGoal: Goal = {
  ...activeGoal,
  id: 'goal_old',
  name: 'Previous rent',
  isActive: false,
  status: 'replaced',
  endedAt: '2026-08-20T12:00:00.000Z',
  createdAt: '2025-08-20T12:00:00.000Z',
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <GoalScreen />
    </QueryClientProvider>,
  );

const press = (element: Parameters<typeof fireEvent.press>[0]) =>
  fireEvent.press(element);

describe('goal lifecycle screen', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockGetActiveGoal.mockResolvedValue(activeGoal);
    mockListGoals.mockResolvedValue([activeGoal, replacedGoal]);
    mockCreateGoal.mockResolvedValue(activeGoal);
    mockUpdateGoal.mockResolvedValue(activeGoal);
    mockEndGoal.mockResolvedValue({
      ...activeGoal,
      isActive: false,
      status: 'completed',
      endedAt: '2026-09-07T12:00:00.000Z',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('waits for a definitive active-goal result before offering creation', async () => {
    let resolveActive!: (goal: Goal) => void;
    mockGetActiveGoal.mockReturnValue(
      new Promise<Goal>((resolve) => {
        resolveActive = resolve;
      }),
    );

    await renderScreen();
    expect(screen.getByText('Loading current goal...')).toBeOnTheScreen();
    expect(
      screen.queryByRole('header', { name: 'Create a goal' }),
    ).not.toBeOnTheScreen();

    resolveActive(activeGoal);
    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();
  });

  it('offers goal creation when no active goal exists', async () => {
    mockGetActiveGoal.mockResolvedValue(null);
    mockListGoals.mockResolvedValue([replacedGoal]);
    await renderScreen();

    expect(await screen.findByText('No active goal yet.')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'Create a goal' }),
    ).toBeOnTheScreen();
  });

  it('lets the user retry a failed active-goal lookup', async () => {
    mockGetActiveGoal.mockRejectedValue(
      new ApiError({ message: 'Unexpected network error' }),
    );
    await renderScreen();

    expect(
      await screen.findByRole(
        'alert',
        {
          name: 'Could not load your current goal. Check your connection and retry.',
        },
        { timeout: 3_000 },
      ),
    ).toBeOnTheScreen();

    mockGetActiveGoal.mockResolvedValue(activeGoal);
    await press(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();
  });

  it('shows history and guards edit, replacement, and completion actions', async () => {
    await renderScreen();

    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();
    expect(screen.getByLabelText(/Previous rent, Replaced/)).toBeOnTheScreen();

    await press(screen.getByRole('button', { name: 'Edit goal' }));
    expect(screen.getByLabelText('Goal target amount in naira')).toHaveProp(
      'value',
      '1200000',
    );
    expect(screen.getByLabelText('Goal due date')).toHaveProp(
      'value',
      '2027-08-20',
    );
    await press(screen.getByRole('button', { name: 'Close form' }));

    await press(screen.getByRole('button', { name: 'Replace goal' }));
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
    await waitFor(() =>
      expect(screen.getByLabelText('Goal name')).toHaveProp(
        'value',
        'School fees',
      ),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Create replacement' }),
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Replace active goal?',
      expect.any(String),
      expect.any(Array),
    );
    expect(mockCreateGoal).not.toHaveBeenCalled();

    await press(screen.getByRole('button', { name: 'Close form' }));
    await press(screen.getByRole('button', { name: 'Mark completed' }));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Mark goal completed?',
      expect.any(String),
      expect.any(Array),
    );
    expect(mockEndGoal).not.toHaveBeenCalled();
    expect(mockUpdateGoal).not.toHaveBeenCalled();

    const actions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    const completion = actions?.find(
      (action) => action.text === 'Mark completed',
    );
    expect(completion).toBeDefined();
    mockGetActiveGoal.mockResolvedValue(null);
    await act(async () => {
      completion?.onPress?.();
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(mockEndGoal).toHaveBeenCalledWith('goal_active', {
      status: 'completed',
    });
    expect(
      queryClient.getQueryData(['goal', 'active', 'session-token']),
    ).toBeNull();
    expect(
      await screen.findByRole('header', { name: 'Create a goal' }),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Annual rent')).not.toBeOnTheScreen();
  });
});
