import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
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

const salary: Transaction = {
  id: 'tx_income',
  userId: 'user_1',
  goalId: null,
  amountKobo: 250_000,
  direction: 'in',
  occurredAt: '2026-08-20T12:00:00.000Z',
  note: 'Salary slice',
  createdAt: '2026-08-20T12:00:00.000Z',
};

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

describe('transactions screen edit busy guard', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockListTransactions.mockResolvedValue([salary, groceries]);
    mockGetActiveGoal.mockResolvedValue(null);
    jest.mocked(deleteTransaction).mockResolvedValue({ ok: true });
  });

  it('locks the editor and other row actions while a save is in flight', async () => {
    let resolveUpdate: ((value: Transaction) => void) | undefined;
    mockUpdateTransaction.mockImplementation(
      () =>
        new Promise<Transaction>((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    await renderScreen();
    expect(await screen.findByText('Groceries')).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Groceries transaction' }),
    );
    await fireEvent.changeText(
      screen.getByLabelText('Transaction amount in naira'),
      '750',
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    });

    await waitFor(() => {
      expect(mockUpdateTransaction).toHaveBeenCalledWith('tx_expense', {
        direction: 'out',
        amountKobo: 75_000,
        occurredAt: '2026-08-21T12:00:00.000Z',
        note: 'Groceries',
      });
      expect(queryClient.isMutating()).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    });
    expect(
      screen.getByRole('button', { name: 'Edit Groceries transaction' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Edit Salary slice transaction' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Delete Groceries transaction' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Delete Salary slice transaction' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(mockUpdateTransaction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUpdate?.({ ...groceries, amountKobo: 75_000 });
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Edit Groceries transaction' }),
      ).not.toBeDisabled(),
    );
    expect(mockUpdateTransaction).toHaveBeenCalledTimes(1);
  });
});
