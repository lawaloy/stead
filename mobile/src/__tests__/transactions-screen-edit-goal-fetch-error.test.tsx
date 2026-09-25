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

describe('transactions screen edit when the active goal cannot load', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockListTransactions.mockResolvedValue(rows);
    mockGetActiveGoal.mockRejectedValue(
      new ApiError({ message: 'Goal service unavailable', status: 503 }),
    );
    mockUpdateTransaction.mockResolvedValue({
      ...rows[0],
      amountKobo: 300_000,
    });
    jest.mocked(deleteTransaction).mockResolvedValue({ ok: true });
  });

  it('saves an amount-only edit without rewriting the existing goal link', async () => {
    await renderScreen();
    await screen.findByText('Salary slice');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Salary slice transaction' }),
    );
    await fireEvent.changeText(
      screen.getByLabelText('Transaction amount in naira'),
      '3000',
    );

    expect(screen.queryByRole('alert')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mockUpdateTransaction).toHaveBeenCalledWith(
        'tx_income',
        expect.objectContaining({
          direction: 'in',
          amountKobo: 300_000,
        }),
      ),
    );
    expect(mockUpdateTransaction.mock.calls[0]?.[1]).not.toHaveProperty(
      'goalId',
    );
    expect(
      screen.queryByText(
        'Create an active goal before linking this transaction.',
      ),
    ).toBeNull();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});
