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

const createdGoal: Goal = {
  ...activeGoal,
  id: 'goal_created',
  name: 'School fees',
  amountTotalKobo: 75_000_000,
  dueDate: '2027-09-01T12:00:00.000Z',
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

describe('goal screen mutations', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockGetActiveGoal.mockResolvedValue(activeGoal);
    mockListGoals.mockResolvedValue([activeGoal]);
    mockCreateGoal.mockResolvedValue(createdGoal);
    mockUpdateGoal.mockResolvedValue({ ...activeGoal, name: 'Rent 2027' });
    mockEndGoal.mockResolvedValue({
      ...activeGoal,
      isActive: false,
      status: 'cancelled',
      endedAt: '2026-09-25T12:00:00.000Z',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a goal when none is active', async () => {
    mockGetActiveGoal.mockResolvedValue(null);
    mockListGoals.mockResolvedValue([]);
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
    mockGetActiveGoal.mockResolvedValue(createdGoal);
    await fireEvent.press(screen.getByRole('button', { name: 'Create goal' }));
    await settle();

    expect(mockCreateGoal).toHaveBeenCalledWith({
      name: 'School fees',
      amountTotalKobo: 75_000_000,
      dueDate: dateInputToIso('2027-09-01'),
    });
    expect(await screen.findByText('Goal created')).toBeOnTheScreen();
    expect(await screen.findByText('School fees')).toBeOnTheScreen();
  });

  it('saves edits to the active goal', async () => {
    await renderScreen();
    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();

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
  });

  it('creates a replacement after the confirmation action', async () => {
    await renderScreen();
    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();

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
    const startReplacement = actions?.find(
      (action) => action.text === 'Start replacement',
    );
    expect(mockCreateGoal).not.toHaveBeenCalled();
    mockGetActiveGoal.mockResolvedValue(createdGoal);
    await act(async () => {
      startReplacement?.onPress?.();
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
  });

  it('cancels the active goal after confirmation', async () => {
    await renderScreen();
    expect(await screen.findByText('Annual rent')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel goal' }));
    const actions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    const cancel = actions?.find((action) => action.text === 'Cancel goal');
    mockGetActiveGoal.mockResolvedValue(null);
    await act(async () => {
      cancel?.onPress?.();
    });
    await settle();

    expect(mockEndGoal).toHaveBeenCalledWith('goal_active', {
      status: 'cancelled',
    });
    expect(
      queryClient.getQueryData(['goal', 'active', 'session-token']),
    ).toBeNull();
    expect(await screen.findByText('Goal cancelled')).toBeOnTheScreen();
    expect(
      await screen.findByRole('header', { name: 'Create a goal' }),
    ).toBeOnTheScreen();
  });
});
