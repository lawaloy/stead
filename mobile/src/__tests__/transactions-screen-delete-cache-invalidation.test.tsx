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
  goalId: null,
  amountKobo: 50_000,
  direction: 'out',
  occurredAt: '2026-08-21T12:00:00.000Z',
  note: 'Groceries',
  createdAt: '2026-08-21T12:00:00.000Z',
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <TransactionsScreen />
    </QueryClientProvider>,
  );

describe('transactions screen delete cache invalidation', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockListTransactions.mockResolvedValue([groceries]);
    mockGetActiveGoal.mockResolvedValue(null);
    jest.mocked(updateTransaction).mockResolvedValue(groceries);
    mockDeleteTransaction.mockResolvedValue({ ok: true });
    queryClient.setQueryData(sessionQueryKeys.dashboard('session-token'), {
      ok: true,
      metrics: { stabilityScore: 80 },
    });
    queryClient.setQueryData(
      sessionQueryKeys.activeGoal('session-token'),
      null,
    );
    queryClient.setQueryData(sessionQueryKeys.transactions('session-token'), [
      groceries,
    ]);
  });

  it('invalidates dashboard, active goal, and activity caches after a successful delete', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    await renderScreen();
    expect(await screen.findByText('Groceries')).toBeOnTheScreen();

    fireEvent.press(
      screen.getByRole('button', { name: 'Delete Groceries transaction' }),
    );

    const actions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    mockListTransactions.mockResolvedValue([]);
    await act(async () => {
      actions?.find((action) => action.style === 'destructive')?.onPress?.();
    });

    expect(mockDeleteTransaction).toHaveBeenCalledWith('tx_expense');
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
