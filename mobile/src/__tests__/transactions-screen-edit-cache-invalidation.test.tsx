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

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <TransactionsScreen />
    </QueryClientProvider>,
  );

describe('transactions screen edit cache invalidation', () => {
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
    queryClient.setQueryData(sessionQueryKeys.dashboard('session-token'), {
      ok: true,
      metrics: { stabilityScore: 80 },
    });
    queryClient.setQueryData(sessionQueryKeys.activeGoal('session-token'), {
      id: 'goal_1',
      name: 'Emergency fund',
    });
    queryClient.setQueryData(sessionQueryKeys.transactions('session-token'), [
      groceries,
    ]);
  });

  it('invalidates dashboard, active goal, and activity caches after a successful edit', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    await renderScreen();
    expect(await screen.findByText('Groceries')).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Groceries transaction' }),
    );
    await fireEvent.changeText(
      screen.getByLabelText('Transaction amount in naira'),
      '750',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mockUpdateTransaction).toHaveBeenCalledWith('tx_expense', {
        direction: 'out',
        amountKobo: 75_000,
        occurredAt: '2026-08-21T12:00:00.000Z',
        note: 'Groceries',
      }),
    );
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: sessionQueryKeys.dashboard('session-token'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: sessionQueryKeys.activeGoal('session-token'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: sessionQueryKeys.transactions('session-token'),
      });
    });
  });
});
