import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
import TransactionsScreen from '../../app/(app)/transactions';
import type { Transaction } from '../contracts/generated/types.gen';
import {
  createTransaction,
  deleteTransaction,
  getActiveGoal,
  listTransactions,
  updateTransaction,
} from '../lib/api';
import { ApiError } from '../lib/api-error';
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
    createTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
    getActiveGoal: jest.fn(),
    listTransactions: jest.fn(),
    updateTransaction: jest.fn(),
  };
});

const mockDeleteTransaction = jest.mocked(deleteTransaction);
const mockListTransactions = jest.mocked(listTransactions);
const mockUpdateTransaction = jest.mocked(updateTransaction);

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
  {
    id: 'tx_expense',
    userId: 'user_1',
    goalId: null,
    amountKobo: 50_000,
    direction: 'out',
    occurredAt: '2026-08-21T12:00:00.000Z',
    note: 'Groceries',
    createdAt: '2026-08-21T12:00:00.000Z',
  },
];

const activeGoal = {
  id: 'goal_1',
  userId: 'user_1',
  name: 'Emergency fund',
  amountTotalKobo: 1_000_000,
  dueDate: '2027-08-20T12:00:00.000Z',
  monthlyIncomeKobo: 500_000,
  isActive: true,
  status: 'active' as const,
  endedAt: null,
  createdAt: '2026-08-20T12:00:00.000Z',
  updatedAt: '2026-08-20T12:00:00.000Z',
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <TransactionsScreen />
    </QueryClientProvider>,
  );

describe('activity screen mutation failures', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockListTransactions.mockResolvedValue(rows);
    jest.mocked(getActiveGoal).mockResolvedValue(activeGoal);
    jest.mocked(createTransaction).mockResolvedValue(rows[0]);
    mockUpdateTransaction.mockRejectedValue(
      new ApiError({ message: 'Activity could not be saved', status: 503 }),
    );
    mockDeleteTransaction.mockRejectedValue(
      new ApiError({ message: 'Activity could not be deleted', status: 503 }),
    );
  });

  it('keeps the editor open when saving an edit fails', async () => {
    await renderScreen();
    await screen.findByText('Salary slice');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Salary slice transaction' }),
    );
    await fireEvent.changeText(
      screen.getByLabelText('Transaction amount in naira'),
      '1200',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByRole('alert', { name: 'Activity could not be saved' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Salary slice')).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });

  it('keeps the row listed when delete fails after confirmation', async () => {
    await renderScreen();
    await screen.findByText('Groceries');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Delete Groceries transaction' }),
    );
    const actions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    actions?.find((action) => action.style === 'destructive')?.onPress?.();

    expect(
      await screen.findByRole('alert', {
        name: 'Activity could not be deleted',
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Groceries')).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});
