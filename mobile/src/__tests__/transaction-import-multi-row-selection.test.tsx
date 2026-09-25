import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
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
  'bad,Invalid,20,expense',
  '2026-09-01,Duplicate,50,expense',
  '2026-09-02,Transfer,250,income',
].join('\n');

describe('transaction import multi-row selection', () => {
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
      duplicateCount: 1,
      invalidCount: 1,
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
          occurredAt: null,
          direction: 'out',
          amountKobo: 2_000,
          note: 'Invalid',
          fingerprint: null,
          duplicate: false,
          error: 'Date must use YYYY-MM-DD',
        },
        {
          rowNumber: 4,
          occurredAt: '2026-09-01T12:00:00.000Z',
          direction: 'out',
          amountKobo: 5_000,
          note: 'Duplicate',
          fingerprint: 'b'.repeat(64),
          duplicate: true,
          error: null,
        },
        {
          rowNumber: 5,
          occurredAt: '2026-09-02T12:00:00.000Z',
          direction: 'in',
          amountKobo: 25_000,
          note: 'Transfer',
          fingerprint: 'c'.repeat(64),
          duplicate: false,
          error: null,
        },
      ],
    });
    mockConfirm.mockResolvedValue({ importedCount: 2, duplicateCount: 0 });
  });

  it('confirms a non-contiguous selection with a sorted row list and summed total', async () => {
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
    expect(
      screen.getByText('2 ready · 1 duplicate · 1 needs correction'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Selected: 2 (₦1,250.00)')).toBeOnTheScreen();

    const salaryRow = screen.getByRole('checkbox', {
      name: 'CSV row 2 Salary',
    });
    const transferRow = screen.getByRole('checkbox', {
      name: 'CSV row 5 Transfer',
    });
    expect(salaryRow).toBeChecked();
    expect(transferRow).toBeChecked();

    await fireEvent.press(salaryRow);
    await fireEvent.press(transferRow);
    await fireEvent.press(transferRow);
    await fireEvent.press(salaryRow);

    expect(salaryRow).toBeChecked();
    expect(transferRow).toBeChecked();
    expect(screen.getByText('Selected: 2 (₦1,250.00)')).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Import 2 selected' }),
    );

    await waitFor(() =>
      expect(mockConfirm).toHaveBeenCalledWith(
        {
          csv,
          rowNumbers: [2, 5],
          goalId: undefined,
        },
        expect.any(Object),
      ),
    );
    expect(await screen.findByText('Import complete')).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});
