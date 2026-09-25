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
import { formatKoboAsNaira } from '../lib/transactions';
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

const mockListTransactions = jest.mocked(listTransactions);
const mockGetActiveGoal = jest.mocked(getActiveGoal);

const income: Transaction = {
  id: 'tx_income',
  userId: 'user_1',
  goalId: 'goal_1',
  amountKobo: 250_000,
  direction: 'in',
  occurredAt: '2026-08-20T12:00:00.000Z',
  note: 'Salary slice',
  createdAt: '2026-08-20T12:00:00.000Z',
};

const expense: Transaction = {
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

describe('transactions screen income filter net', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockListTransactions.mockResolvedValue([income, expense]);
    mockGetActiveGoal.mockResolvedValue(null);
    jest.mocked(updateTransaction).mockResolvedValue(income);
    jest.mocked(deleteTransaction).mockResolvedValue({ ok: true });
  });

  it('narrows the visible net to income rows when the Income tab is selected', async () => {
    await renderScreen();

    expect(
      await screen.findByLabelText(`Visible net ${formatKoboAsNaira(200_000)}`),
    ).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'All' })).toBeSelected();

    await fireEvent.press(screen.getByRole('tab', { name: 'Income' }));

    expect(screen.getByRole('tab', { name: 'Income' })).toBeSelected();
    expect(screen.getByText('Salary slice')).toBeOnTheScreen();
    expect(screen.queryByText('Groceries')).toBeNull();
    expect(
      screen.getByLabelText(`Visible net ${formatKoboAsNaira(250_000)}`),
    ).toBeOnTheScreen();
    expect(
      screen.queryByLabelText(`Visible net ${formatKoboAsNaira(200_000)}`),
    ).toBeNull();
  });
});
