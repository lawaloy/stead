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
import { nairaInputToKobo } from '../lib/transactions';
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

const row: Transaction = {
  id: 'tx_income',
  userId: 'user_1',
  goalId: 'goal_1',
  amountKobo: 250_000,
  direction: 'in',
  occurredAt: '2026-08-20T12:00:00.000Z',
  note: 'Salary slice',
  createdAt: '2026-08-20T12:00:00.000Z',
};

const nextAmountNaira = '3750.50';
const nextAmountKobo = 375_050;

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <TransactionsScreen />
    </QueryClientProvider>,
  );

describe('transactions screen edit amount change', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockListTransactions.mockResolvedValue([row]);
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
    mockUpdateTransaction.mockResolvedValue({
      ...row,
      amountKobo: nextAmountKobo,
    });
    jest.mocked(deleteTransaction).mockResolvedValue({ ok: true });
  });

  it('sends the edited naira amount as kobo instead of the list row total', async () => {
    await renderScreen();
    await screen.findByText('Salary slice');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Salary slice transaction' }),
    );
    expect(screen.getByLabelText('Transaction amount in naira')).toHaveProp(
      'value',
      '2500',
    );

    await fireEvent.changeText(
      screen.getByLabelText('Transaction amount in naira'),
      nextAmountNaira,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Transaction amount in naira')).toHaveProp(
        'value',
        nextAmountNaira,
      ),
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(nairaInputToKobo(nextAmountNaira)).toBe(nextAmountKobo);
    await waitFor(() =>
      expect(mockUpdateTransaction).toHaveBeenCalledWith('tx_income', {
        direction: 'in',
        amountKobo: nextAmountKobo,
        occurredAt: '2026-08-20T12:00:00.000Z',
        note: 'Salary slice',
      }),
    );
    expect(mockUpdateTransaction).not.toHaveBeenCalledWith(
      'tx_income',
      expect.objectContaining({ amountKobo: 250_000 }),
    );
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});
