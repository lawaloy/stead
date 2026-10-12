import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import TransactionsScreen from '../../app/(app)/transactions';
import type { Transaction } from '../contracts/generated/types.gen';
import {
  deleteTransaction,
  getActiveGoal,
  listTransactions,
  updateTransaction,
} from '../lib/api';
import { formatKoboAsNaira } from '../lib/transactions';
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
    deleteTransaction: jest.fn(),
    getActiveGoal: jest.fn(),
    listTransactions: jest.fn(),
    updateTransaction: jest.fn(),
  };
});

const mockUpdateTransaction = jest.mocked(updateTransaction);
const mockGetActiveGoal = jest.mocked(getActiveGoal);
const mockListTransactions = jest.mocked(listTransactions);

const groceries: Transaction = {
  id: 'tx_expense',
  userId: 'user_1',
  goalId: 'goal_1',
  amountKobo: 50_000,
  direction: 'out',
  occurredAt: '2026-08-21T12:00:00.000Z',
  note: 'Groceries',
  createdAt: '2026-08-21T12:00:00.000Z',
};

const updatedGroceries: Transaction = {
  ...groceries,
  amountKobo: 75_000,
};

const dashboardCache = { ok: true, metrics: { stabilityScore: 80 } };
const activeGoalCache = {
  id: 'goal_1',
  name: 'Emergency fund',
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <TransactionsScreen />
    </QueryClientProvider>,
  );

describe('transactions screen edit success invalidate failure', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockListTransactions.mockResolvedValue([groceries]);
    mockGetActiveGoal.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Emergency fund',
      amountTotalKobo: 1_000_000,
      dueDate: '2027-08-20T12:00:00.000Z',
      monthlyIncomeKobo: 500_000,
      isActive: true,
      status: 'active',
      endedAt: null,
      createdAt: '2026-08-20T12:00:00.000Z',
    });
    mockUpdateTransaction.mockResolvedValue(updatedGroceries);
    jest.mocked(deleteTransaction).mockResolvedValue({ ok: true });
    queryClient.setQueryData(
      sessionQueryKeys.dashboard('session-token'),
      dashboardCache,
    );
    queryClient.setQueryData(
      sessionQueryKeys.activeGoal('session-token'),
      activeGoalCache,
    );
    queryClient.setQueryData(sessionQueryKeys.transactions('session-token'), [
      groceries,
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the patched list and closed editor when finance refresh rejects', async () => {
    const invalidateSpy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockRejectedValue(new Error('Failed to refresh finance caches'));
    await renderScreen();
    expect(await screen.findByText('Groceries')).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Groceries transaction' }),
    );
    await fireEvent.changeText(
      screen.getByLabelText('Transaction amount in naira'),
      '750',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(mockUpdateTransaction).toHaveBeenCalledWith('tx_expense', {
      direction: 'out',
      amountKobo: 75_000,
      occurredAt: '2026-08-21T12:00:00.000Z',
      note: 'Groceries',
    });
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(
      screen.queryByRole('alert', { name: 'Activity could not be saved' }),
    ).toBeNull();
    expect(
      screen.queryByRole('alert', { name: 'Failed to refresh finance caches' }),
    ).toBeNull();
    expect(
      screen.getByLabelText(`Visible net ${formatKoboAsNaira(-75_000)}`),
    ).toBeOnTheScreen();
    expect(
      screen.queryByLabelText(`Visible net ${formatKoboAsNaira(-50_000)}`),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Edit Groceries transaction' }),
    ).toBeOnTheScreen();
    expect(invalidateSpy).toHaveBeenCalled();
    expect(
      queryClient.getQueryData(sessionQueryKeys.transactions('session-token')),
    ).toEqual([updatedGroceries]);
    expect(
      queryClient.getQueryData(sessionQueryKeys.dashboard('session-token')),
    ).toEqual(dashboardCache);
    expect(
      queryClient.getQueryData(sessionQueryKeys.activeGoal('session-token')),
    ).toEqual(activeGoalCache);
    expect(
      queryClient.getQueryState(sessionQueryKeys.dashboard('session-token'))
        ?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(sessionQueryKeys.activeGoal('session-token'))
        ?.isInvalidated,
    ).toBe(false);
  });
});
