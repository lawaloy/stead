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
import AddTransactionScreen from '../../app/(app)/add-transaction';
import type { Transaction } from '../contracts/generated/types.gen';
import {
  ApiError,
  createTransaction,
  deleteTransaction,
  getActiveGoal,
  listTransactions,
  updateTransaction,
} from '../lib/api';
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
    deleteTransaction: jest.fn(),
    getActiveGoal: jest.fn(),
    listTransactions: jest.fn(),
    updateTransaction: jest.fn(),
  };
});

const mockCreateTransaction = jest.mocked(createTransaction);
const mockDeleteTransaction = jest.mocked(deleteTransaction);
const mockGetActiveGoal = jest.mocked(getActiveGoal);
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
  createdAt: '2026-08-20T12:00:00.000Z',
  updatedAt: '2026-08-20T12:00:00.000Z',
};

const renderWithQueryClient = async (screenElement: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      {screenElement}
    </QueryClientProvider>,
  );

describe('transaction screens', () => {
  beforeEach(() => {
    queryClient.clear();
    mockListTransactions.mockResolvedValue(rows);
    mockGetActiveGoal.mockResolvedValue(activeGoal);
    mockUpdateTransaction.mockImplementation(async (id, payload) => ({
      ...rows.find((row) => row.id === id)!,
      ...payload,
    }));
    mockDeleteTransaction.mockResolvedValue({ ok: true });
    mockCreateTransaction.mockResolvedValue(rows[0]);
  });

  it('covers the activity journey, filters, and accessible controls', async () => {
    await renderWithQueryClient(<TransactionsScreen />);

    expect(await screen.findByRole('header', { name: 'Activity' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Visible net ₦2,000.00')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'All' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Edit Salary slice transaction' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete Groceries transaction' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Expenses' }));

    expect(screen.getByRole('tab', { name: 'Expenses' })).toBeSelected();
    expect(screen.queryByText('Salary slice')).not.toBeOnTheScreen();
    expect(screen.getByText('Groceries')).toBeOnTheScreen();
    expect(screen.getByLabelText('Visible net -₦500.00')).toBeOnTheScreen();
  });

  it('validates and saves an edited transaction through the screen', async () => {
    await renderWithQueryClient(<TransactionsScreen />);
    await screen.findByText('Salary slice');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Salary slice transaction' }),
    );
    const amount = screen.getByLabelText('Transaction amount in naira');
    await fireEvent.changeText(amount, '0');

    expect(
      screen.getByRole('alert', {
        name: 'Enter an amount greater than zero with at most two decimal places.',
      }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await fireEvent.changeText(amount, '1200');
    await fireEvent.press(screen.getByRole('tab', { name: 'Expense' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mockUpdateTransaction).toHaveBeenCalledWith(
        'tx_income',
        expect.objectContaining({ direction: 'out', amountKobo: 120_000 }),
      ),
    );
  });

  it('keeps cached history visible offline and retries without discarding it', async () => {
    queryClient.setQueryData(
      sessionQueryKeys.transactions('session-token'),
      rows,
      { updatedAt: Date.now() - 60_000 },
    );
    mockListTransactions.mockRejectedValue(
      new ApiError({ message: 'Unexpected network error' }),
    );

    await renderWithQueryClient(<TransactionsScreen />);

    expect(screen.getByText('Salary slice')).toBeOnTheScreen();
    await waitFor(
      () =>
        expect(
          screen.getByRole('alert', {
            name: 'We could not refresh your activity. Showing saved activity while you reconnect.',
          }),
        ).toBeOnTheScreen(),
      { timeout: 3_000 },
    );

    mockListTransactions.mockResolvedValue(rows);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Retry loading activity' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText(/Showing saved activity/),
      ).not.toBeOnTheScreen(),
    );
  });

  it('blocks goal-linked submit while the active goal is still loading', async () => {
    let releaseGoal: (value: typeof activeGoal) => void = () => undefined;
    mockGetActiveGoal.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGoal = resolve;
        }),
    );

    await renderWithQueryClient(<AddTransactionScreen />);

    expect(
      await screen.findByText('Checking your active goal...'),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Add Transaction' }),
    ).toBeDisabled();
    expect(mockCreateTransaction).not.toHaveBeenCalled();

    releaseGoal(activeGoal);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add Transaction' }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByText('Checking your active goal...'),
    ).not.toBeOnTheScreen();
  });

  it('prompts for a goal when the active-goal lookup settles with 404', async () => {
    mockGetActiveGoal.mockRejectedValue(
      new ApiError({ message: 'No active goal found', status: 404 }),
    );

    await renderWithQueryClient(<AddTransactionScreen />);

    expect(
      await screen.findByRole('alert', {
        name: 'Create an active goal or turn off goal linking.',
      }),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText('Checking your active goal...'),
    ).not.toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Add Transaction' }),
    ).toBeDisabled();
  });

  it('blocks unverifiable goal links and reports disconnected writes accessibly', async () => {
    mockGetActiveGoal.mockRejectedValue(
      new ApiError({ message: 'Unexpected network error' }),
    );
    mockCreateTransaction.mockRejectedValue(
      new ApiError({ message: 'Unexpected network error' }),
    );

    await renderWithQueryClient(<AddTransactionScreen />);

    expect(await screen.findByRole('header', { name: 'Add Transaction' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Income' })).toBeSelected();
    await waitFor(() =>
      expect(
        screen.getByRole('alert', {
          name: 'Your active goal is unavailable. Reconnect or turn off goal linking.',
        }),
      ).toBeOnTheScreen(),
      { timeout: 3_000 },
    );
    expect(screen.getByRole('button', { name: 'Add Transaction' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Add Transaction' })).toBeEnabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Add Transaction' }));

    expect(
      await screen.findByRole('alert', { name: 'Unexpected network error' }),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Transaction added')).not.toBeOnTheScreen();
  });

  it('creates a goal-linked expense through accessible form controls', async () => {
    await renderWithQueryClient(<AddTransactionScreen />);

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
    await fireEvent.changeText(
      screen.getByLabelText('Transaction note'),
      'Bus fare',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Add Transaction' }),
    );

    await waitFor(() =>
      expect(mockCreateTransaction).toHaveBeenCalledWith({
        direction: 'out',
        amountKobo: 2_550,
        occurredAt: expect.any(String),
        note: 'Bus fare',
        goalId: 'goal_1',
      }),
    );
    expect(
      await screen.findByRole('alert', { name: 'Transaction added' }),
    ).toBeOnTheScreen();
  });

  it('omits goalId when the customer turns off goal tagging', async () => {
    await renderWithQueryClient(<AddTransactionScreen />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add Transaction' }),
      ).toBeEnabled(),
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).not.toBeChecked();

    await fireEvent.press(screen.getByRole('tab', { name: 'Expense' }));
    await fireEvent.changeText(
      screen.getByLabelText('Transaction amount in naira'),
      '40',
    );
    await fireEvent.changeText(
      screen.getByLabelText('Transaction note'),
      'Unlinked fare',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Add Transaction' }),
    );

    await waitFor(() =>
      expect(mockCreateTransaction).toHaveBeenCalledWith({
        direction: 'out',
        amountKobo: 4_000,
        occurredAt: expect.any(String),
        note: 'Unlinked fare',
        goalId: undefined,
      }),
    );
    expect(
      await screen.findByRole('alert', { name: 'Transaction added' }),
    ).toBeOnTheScreen();
  });

  it('shows a cold-load failure without inventing cached activity', async () => {
    mockListTransactions.mockRejectedValue(
      new ApiError({ message: 'Unexpected network error' }),
    );

    await renderWithQueryClient(<TransactionsScreen />);

    await waitFor(
      () =>
        expect(
          screen.getByRole('alert', {
            name: 'We could not load your activity. Reconnect and try again.',
          }),
        ).toBeOnTheScreen(),
      { timeout: 3_000 },
    );
    expect(screen.queryByText('Salary slice')).not.toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Retry loading activity' }),
    ).toBeOnTheScreen();
  });

  it('keeps an older goal link until the customer explicitly retags the transaction', async () => {
    const olderLinked: Transaction = {
      id: 'tx_old_goal',
      userId: 'user_1',
      goalId: 'goal_old',
      amountKobo: 80_000,
      direction: 'in',
      occurredAt: '2026-08-19T12:00:00.000Z',
      note: 'Old rent slice',
      createdAt: '2026-08-19T12:00:00.000Z',
    };
    mockListTransactions.mockResolvedValue([olderLinked]);
    mockUpdateTransaction.mockImplementation(async (_id, payload) => ({
      ...olderLinked,
      ...payload,
    }));

    await renderWithQueryClient(<TransactionsScreen />);
    await screen.findByText('Old rent slice');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Old rent slice transaction' }),
    );

    expect(screen.getByText('Keep the current goal link')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox')).toBeChecked();

    await fireEvent.changeText(
      screen.getByLabelText('Transaction amount in naira'),
      '900',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mockUpdateTransaction).toHaveBeenCalledWith('tx_old_goal', {
        direction: 'in',
        amountKobo: 90_000,
        occurredAt: '2026-08-19T12:00:00.000Z',
        note: 'Old rent slice',
      }),
    );
    expect(mockUpdateTransaction.mock.calls[0][1]).not.toHaveProperty('goalId');

    mockListTransactions.mockResolvedValue([
      { ...olderLinked, amountKobo: 90_000 },
    ]);
    mockUpdateTransaction.mockClear();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Old rent slice transaction' }),
    );
    expect(
      await screen.findByText('Keep the current goal link'),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByText('Count toward Emergency fund')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mockUpdateTransaction).toHaveBeenCalledWith('tx_old_goal', {
        direction: 'in',
        amountKobo: 90_000,
        occurredAt: '2026-08-19T12:00:00.000Z',
        note: 'Old rent slice',
        goalId: 'goal_1',
      }),
    );
  });

  it('does not revert a just-saved amount when re-editing before the list refetch completes', async () => {
    let releaseRefetch: (value: Transaction[]) => void = () => undefined;
    let listCalls = 0;
    mockListTransactions.mockImplementation(
      () =>
        new Promise((resolve) => {
          listCalls += 1;
          if (listCalls === 1) {
            resolve(rows);
            return;
          }
          releaseRefetch = resolve;
        }),
    );
    mockUpdateTransaction.mockImplementation(async (id, payload) => ({
      ...rows.find((row) => row.id === id)!,
      ...payload,
    }));

    await renderWithQueryClient(<TransactionsScreen />);
    await screen.findByText('Salary slice');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Salary slice transaction' }),
    );
    await fireEvent.changeText(
      screen.getByLabelText('Transaction amount in naira'),
      '6000',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mockUpdateTransaction).toHaveBeenCalledWith(
        'tx_income',
        expect.objectContaining({ amountKobo: 600_000 }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Save changes' }),
      ).not.toBeOnTheScreen(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Salary slice transaction' }),
    );
    expect(screen.getByLabelText('Transaction amount in naira')).toHaveDisplayValue(
      '6000',
    );

    await fireEvent.changeText(
      screen.getByLabelText('Transaction note'),
      'Salary slice, corrected',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mockUpdateTransaction).toHaveBeenLastCalledWith('tx_income', {
        direction: 'in',
        amountKobo: 600_000,
        occurredAt: '2026-08-20T12:00:00.000Z',
        note: 'Salary slice, corrected',
      }),
    );

    releaseRefetch([
      {
        ...rows[0],
        amountKobo: 600_000,
        note: 'Salary slice, corrected',
      },
      rows[1],
    ]);
  });

  it('blocks an explicit edit goal link when no active goal is available', async () => {
    mockGetActiveGoal.mockRejectedValue(
      new ApiError({ message: 'No active goal found', status: 404 }),
    );

    await renderWithQueryClient(<TransactionsScreen />);
    await screen.findByText('Groceries');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Edit Groceries transaction' }),
    );
    await fireEvent.press(screen.getByRole('checkbox'));

    expect(
      screen.getByRole('alert', {
        name: 'Create an active goal before linking this transaction.',
      }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(mockUpdateTransaction).not.toHaveBeenCalled();
  });

  it('requires destructive confirmation before deleting a transaction', async () => {
    await renderWithQueryClient(<TransactionsScreen />);
    await screen.findByText('Groceries');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Delete Groceries transaction' }),
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete transaction?',
      expect.stringContaining('will be removed'),
      expect.any(Array),
    );

    const actions = jest.mocked(Alert.alert).mock.calls[0][2];
    const destructive = actions?.find((action) => action.style === 'destructive');
    destructive?.onPress?.();

    await waitFor(() =>
      expect(mockDeleteTransaction).toHaveBeenCalledWith('tx_expense'),
    );
  });
});
