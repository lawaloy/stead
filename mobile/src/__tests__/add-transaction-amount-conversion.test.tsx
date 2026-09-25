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
import { dateInputToIso, nairaInputToKobo } from '../lib/transactions';
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
jest.mock('../lib/transactions', () => {
  const actual = jest.requireActual(
    '../lib/transactions',
  ) as typeof import('../lib/transactions');
  return {
    ...actual,
    todayDateInput: jest.fn(() => '2011-11-11'),
  };
});

const mockCreateTransaction = jest.mocked(createTransaction);
const mockGetActiveGoal = jest.mocked(getActiveGoal);
const nextAmountNaira = '3750.50';
const nextAmountKobo = 375_050;

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

describe('add transaction amount conversion', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGetActiveGoal.mockResolvedValue(activeGoal);
    mockCreateTransaction.mockResolvedValue({
      id: 'tx_1',
      userId: 'user_1',
      goalId: 'goal_1',
      amountKobo: nextAmountKobo,
      direction: 'in',
      occurredAt: dateInputToIso('2011-11-11') as string,
      note: 'manual entry',
      createdAt: '2011-11-11T12:00:00.000Z',
    });
  });

  it('sends the edited naira amount as kobo instead of the seeded default', async () => {
    await renderScreen();
    expect(screen.getByLabelText('Transaction amount in naira')).toHaveProp(
      'value',
      '5000',
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add Transaction' }),
      ).toBeEnabled(),
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
    expect(
      screen.getByRole('button', { name: 'Add Transaction' }),
    ).toBeEnabled();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Add Transaction' }),
    );

    expect(nairaInputToKobo(nextAmountNaira)).toBe(nextAmountKobo);
    await waitFor(() =>
      expect(mockCreateTransaction).toHaveBeenCalledWith({
        direction: 'in',
        amountKobo: nextAmountKobo,
        occurredAt: dateInputToIso('2011-11-11'),
        note: 'manual entry',
        goalId: 'goal_1',
      }),
    );
    expect(mockCreateTransaction).not.toHaveBeenCalledWith(
      expect.objectContaining({ amountKobo: 500_000 }),
    );
    expect(mockCreateTransaction).not.toHaveBeenCalledWith(
      expect.objectContaining({ amountKobo: 3750 }),
    );
  });
});
