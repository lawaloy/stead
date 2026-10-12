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

const mockDeleteTransaction = jest.mocked(deleteTransaction);
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

describe('transactions screen delete success invalidate failure', () => {
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
    jest.mocked(updateTransaction).mockResolvedValue(groceries);
    mockDeleteTransaction.mockResolvedValue({ ok: true });
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

  it('keeps the deleted row and surfaces the refresh error when finance refresh rejects', async () => {
    const invalidateSpy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockRejectedValue(new Error('Failed to refresh finance caches'));
    await renderScreen();
    expect(await screen.findByText('Groceries')).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    fireEvent.press(
      screen.getByRole('button', { name: 'Delete Groceries transaction' }),
    );
    const actions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    await act(async () => {
      actions?.find((action) => action.style === 'destructive')?.onPress?.();
    });

    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(mockDeleteTransaction).toHaveBeenCalledWith('tx_expense');
    expect(screen.getByText('Groceries')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(`Visible net ${formatKoboAsNaira(-50_000)}`),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('alert', { name: 'Failed to refresh finance caches' }),
    ).toBeOnTheScreen();
    expect(invalidateSpy).toHaveBeenCalled();
    expect(
      queryClient.getQueryData(sessionQueryKeys.transactions('session-token')),
    ).toEqual([groceries]);
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
    expect(
      queryClient.getQueryState(sessionQueryKeys.transactions('session-token'))
        ?.isInvalidated,
    ).toBe(false);
  });
});
