import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import ImportTransactionsScreen from '../../app/(app)/import-transactions';
import type { TransactionImportPreview } from '../contracts/generated/types.gen';
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
].join('\n');

const preview: TransactionImportPreview = {
  readyCount: 1,
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
  ],
};

describe('transaction import preview busy guard', () => {
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
    mockConfirm.mockResolvedValue({ importedCount: 1, duplicateCount: 0 });
  });

  it('locks the file picker while preview is in flight', async () => {
    let resolvePreview: ((value: TransactionImportPreview) => void) | undefined;
    mockPreview.mockImplementation(
      () =>
        new Promise<TransactionImportPreview>((resolve) => {
          resolvePreview = resolve;
        }),
    );

    await render(
      <QueryClientProvider client={queryClient}>
        <ImportTransactionsScreen />
      </QueryClientProvider>,
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Choose transaction CSV file' }),
      );
    });

    await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(1));
    expect(mockPick).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Checking file…')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Choose transaction CSV file' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('progressbar', { name: 'Checking your CSV…' }),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: 'Import 1 selected' }),
    ).toBeNull();
    expect(mockConfirm).not.toHaveBeenCalled();

    await act(async () => {
      resolvePreview?.(preview);
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(
      await screen.findByRole('button', { name: 'Import 1 selected' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Choose transaction CSV file' }),
    ).not.toBeDisabled();
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(mockPick).toHaveBeenCalledTimes(1);
  });
});
