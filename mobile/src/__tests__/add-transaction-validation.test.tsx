import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import AddTransactionScreen from '../../app/(app)/add-transaction';
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

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AddTransactionScreen />
    </QueryClientProvider>,
  );

describe('add transaction client validation', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGetActiveGoal.mockResolvedValue(activeGoal);
    mockCreateTransaction.mockResolvedValue({
      id: 'tx_1',
      userId: 'user_1',
      goalId: 'goal_1',
      amountKobo: 500_000,
      direction: 'in',
      occurredAt: '2026-09-01T00:00:00.000Z',
      note: 'manual entry',
      createdAt: '2026-09-01T00:00:00.000Z',
    });
  });

  it('blocks a zero amount before calling the API', async () => {
    await renderScreen();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add Transaction' }),
      ).toBeEnabled(),
    );

    await fireEvent.changeText(
      screen.getByLabelText('Transaction amount in naira'),
      '0',
    );

    expect(
      screen.getByRole('alert', {
        name: 'Enter an amount greater than zero with at most two decimal places.',
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Add Transaction' }),
    ).toBeDisabled();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('blocks an invalid calendar date before calling the API', async () => {
    await renderScreen();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add Transaction' }),
      ).toBeEnabled(),
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
    expect(
      screen.getByRole('button', { name: 'Add Transaction' }),
    ).toBeDisabled();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('blocks a note longer than 280 characters before calling the API', async () => {
    await renderScreen();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add Transaction' }),
      ).toBeEnabled(),
    );

    await fireEvent.changeText(
      screen.getByLabelText('Transaction note'),
      'x'.repeat(281),
    );

    expect(
      screen.getByRole('alert', {
        name: 'Note must be 280 characters or fewer.',
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Add Transaction' }),
    ).toBeDisabled();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });
});
