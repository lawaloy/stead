import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
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

const rows: Transaction[] = [
  {
    id: 'tx_income',
    userId: 'user_1',
    goalId: 'goal_1',
    amountKobo: 250_000,
    direction: 'in',
    occurredAt: '2026-08-20T12:00:00.000Z',
    note: 'Salary slice',
    createdAt: '2026-08-20T12:00:00.000Z',
  },
];

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <TransactionsScreen />
    </QueryClientProvider>,
  );

describe('transactions screen edit validation', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockListTransactions.mockResolvedValue(rows);
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
    mockUpdateTransaction.mockResolvedValue(rows[0]);
    jest.mocked(deleteTransaction).mockResolvedValue({ ok: true });
  });

  it('blocks an invalid calendar date before saving an edit', async () => {
    await renderScreen();
    await screen.findByText('Salary slice');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Salary slice transaction' }),
    );
    await fireEvent.changeText(
      screen.getByLabelText('Transaction date'),
      '2026-02-30',
    );

    expect(
      screen.getByRole('alert', {
        name: 'Enter a valid date in YYYY-MM-DD format.',
      }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(mockUpdateTransaction).not.toHaveBeenCalled();
  });
});
