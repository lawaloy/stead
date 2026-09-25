import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import AddTransactionScreen from '../../app/(app)/add-transaction';
import type { Transaction } from '../contracts/generated/types.gen';
import { createTransaction, getActiveGoal } from '../lib/api';
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
    getActiveGoal: jest.fn(),
  };
});

const mockCreateTransaction = jest.mocked(createTransaction);
const mockGetActiveGoal = jest.mocked(getActiveGoal);

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

const created: Transaction = {
  id: 'tx_new',
  userId: 'user_1',
  goalId: 'goal_1',
  amountKobo: 500_000,
  direction: 'in',
  occurredAt: '2026-08-20T12:00:00.000Z',
  note: 'manual entry',
  createdAt: '2026-08-20T12:00:00.000Z',
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AddTransactionScreen />
    </QueryClientProvider>,
  );

describe('add transaction busy guard', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGetActiveGoal.mockResolvedValue(activeGoal);
  });

  it('disables submit and shows Submitting while the create is in flight', async () => {
    let resolveCreate: ((value: Transaction) => void) | undefined;
    mockCreateTransaction.mockImplementation(
      () =>
        new Promise<Transaction>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    await renderScreen();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add Transaction' }),
      ).toBeEnabled(),
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Add Transaction' }));
    });

    await waitFor(() => expect(mockCreateTransaction).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Submitting...')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Submitting...' }),
    ).toBeDisabled();
    expect(screen.queryByText('Transaction added')).toBeNull();

    await act(async () => {
      resolveCreate?.(created);
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(await screen.findByText('Transaction added')).toBeOnTheScreen();
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
  });
});
