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

const income: Transaction = {
  id: 'tx_income',
  userId: 'user_1',
  goalId: null,
  amountKobo: 250_000,
  direction: 'in',
  occurredAt: '2026-08-20T12:00:00.000Z',
  note: 'Salary slice',
  createdAt: '2026-08-20T12:00:00.000Z',
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <TransactionsScreen />
    </QueryClientProvider>,
  );

describe('transactions screen edit cancel discard', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockListTransactions.mockResolvedValue([income]);
    mockGetActiveGoal.mockResolvedValue(null);
    mockUpdateTransaction.mockResolvedValue(income);
    jest.mocked(deleteTransaction).mockResolvedValue({ ok: true });
  });

  it('reloads the list row after Cancel so an abandoned draft cannot be saved later', async () => {
    await renderScreen();
    await screen.findByText('Salary slice');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Salary slice transaction' }),
    );
    expect(screen.getByText('Edit transaction')).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText('Transaction amount in naira'),
      '9999',
    );
    await fireEvent.changeText(
      screen.getByLabelText('Transaction note'),
      'Abandoned draft',
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Transaction amount in naira')).toHaveProp(
        'value',
        '9999',
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Transaction note')).toHaveProp(
        'value',
        'Abandoned draft',
      ),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Edit transaction')).toBeNull();
    expect(mockUpdateTransaction).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Salary slice transaction' }),
    );
    expect(screen.getByLabelText('Transaction amount in naira')).toHaveProp(
      'value',
      '2500',
    );
    expect(screen.getByLabelText('Transaction note')).toHaveProp(
      'value',
      'Salary slice',
    );
    expect(mockUpdateTransaction).not.toHaveBeenCalled();
  });
});
