import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ImportTransactionsScreen from '../../app/(app)/import-transactions';
import {
  confirmTransactionImport,
  getActiveGoal,
  previewTransactionImport,
} from '../lib/api';
import { queryClient } from '../lib/query-client';
import { pickTransactionCsv } from '../lib/transaction-import-file';

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
jest.mock('../lib/transaction-import-file', () => ({
  pickTransactionCsv: jest.fn(),
}));
jest.mock('../lib/api', () => {
  const { ApiError } = jest.requireActual('../lib/api-error');
  return {
    ApiError,
    confirmTransactionImport: jest.fn(),
    getActiveGoal: jest.fn(),
    previewTransactionImport: jest.fn(),
  };
});

const mockPick = jest.mocked(pickTransactionCsv);
const mockPreview = jest.mocked(previewTransactionImport);
const mockConfirm = jest.mocked(confirmTransactionImport);
const mockGoal = jest.mocked(getActiveGoal);
const csv = [
  'date,description,amount,type',
  '2026-09-01,Salary,1000,income',
  '2026-09-02,Groceries,500,expense',
].join('\n');

describe('transaction import mixed-direction selection total', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockPick.mockResolvedValue({ name: 'statement.csv', csv });
    mockGoal.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Rent',
      amountTotalKobo: 1_000_000,
      dueDate: '2027-01-01T12:00:00.000Z',
      monthlyIncomeKobo: null,
      isActive: true,
      status: 'active',
      endedAt: null,
      createdAt: '2026-09-01T12:00:00.000Z',
    });
    mockPreview.mockResolvedValue({
      readyCount: 2,
      duplicateCount: 0,
      invalidCount: 0,
      rows: [
        {
          rowNumber: 2,
          occurredAt: '2026-09-01T12:00:00.000Z',
          direction: 'in',
          amountKobo: 100_000,
          note: 'Salary',
          fingerprint: 'a'.repeat(64),
          duplicate: false,
          error: null,
        },
        {
          rowNumber: 3,
          occurredAt: '2026-09-02T12:00:00.000Z',
          direction: 'out',
          amountKobo: 50_000,
          note: 'Groceries',
          fingerprint: 'b'.repeat(64),
          duplicate: false,
          error: null,
        },
      ],
    });
    mockConfirm.mockResolvedValue({ importedCount: 2, duplicateCount: 0 });
  });

  it('sums selected income and expense amounts instead of showing a net total', async () => {
    await render(
      <QueryClientProvider client={queryClient}>
        <ImportTransactionsScreen />
      </QueryClientProvider>,
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Choose transaction CSV file' }),
    );
    expect(
      await screen.findByText('Review before importing'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Selected: 2 (₦1,500.00)')).toBeOnTheScreen();
    expect(screen.queryByText('Selected: 2 (₦500.00)')).not.toBeOnTheScreen();

    const expenseRow = screen.getByRole('checkbox', {
      name: 'CSV row 3 Groceries',
    });
    await fireEvent.press(expenseRow);
    expect(screen.getByText('Selected: 1 (₦1,000.00)')).toBeOnTheScreen();

    await fireEvent.press(expenseRow);
    expect(screen.getByText('Selected: 2 (₦1,500.00)')).toBeOnTheScreen();
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});
