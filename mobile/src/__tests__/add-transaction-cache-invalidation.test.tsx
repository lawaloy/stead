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

describe('add transaction cache invalidation', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGetActiveGoal.mockResolvedValue(activeGoal);
    mockCreateTransaction.mockResolvedValue({
      id: 'tx_1',
      userId: 'user_1',
      goalId: 'goal_1',
      amountKobo: 2_550,
      direction: 'out',
      occurredAt: '2026-09-01T00:00:00.000Z',
      note: 'Bus fare',
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    queryClient.setQueryData(sessionQueryKeys.dashboard('session-token'), {
      ok: true,
      metrics: { stabilityScore: 80 },
    });
    queryClient.setQueryData(
      sessionQueryKeys.activeGoal('session-token'),
      activeGoal,
    );
    queryClient.setQueryData(
      sessionQueryKeys.transactions('session-token'),
      [],
    );
  });

  it('invalidates dashboard, active goal, and activity caches after a successful add', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    await renderScreen();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add Transaction' }),
      ).toBeEnabled(),
    );

    await fireEvent.press(screen.getByRole('tab', { name: 'Expense' }));
    await fireEvent.changeText(
      screen.getByLabelText('Transaction amount in naira'),
      '25.50',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Add Transaction' }),
    );

    expect(
      await screen.findByRole('alert', { name: 'Transaction added' }),
    ).toBeOnTheScreen();
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
