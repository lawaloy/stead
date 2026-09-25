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

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AddTransactionScreen />
    </QueryClientProvider>,
  );

describe('add transaction without an active goal', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGetActiveGoal.mockResolvedValue(null);
    mockCreateTransaction.mockResolvedValue({
      id: 'tx_1',
      userId: 'user_1',
      goalId: null,
      amountKobo: 500_000,
      direction: 'in',
      occurredAt: '2026-09-01T00:00:00.000Z',
      note: 'manual entry',
      createdAt: '2026-09-01T00:00:00.000Z',
    });
  });

  it('records an unlinked transaction after the customer turns off goal linking', async () => {
    await renderScreen();

    expect(
      await screen.findByRole('alert', {
        name: 'Create an active goal or turn off goal linking.',
      }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Add Transaction' }),
    ).toBeDisabled();

    await fireEvent.press(screen.getByRole('checkbox'));

    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(
      screen.queryByRole('alert', {
        name: 'Create an active goal or turn off goal linking.',
      }),
    ).not.toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Add Transaction' }),
    ).toBeEnabled();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Add Transaction' }),
    );

    await waitFor(() =>
      expect(mockCreateTransaction).toHaveBeenCalledWith({
        direction: 'in',
        amountKobo: 500_000,
        occurredAt: expect.any(String),
        note: 'manual entry',
        goalId: undefined,
      }),
    );
    expect(
      await screen.findByRole('alert', { name: 'Transaction added' }),
    ).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});
