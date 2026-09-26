import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import ImportTransactionsScreen from '../../app/(app)/import-transactions';
import { ApiError } from '../lib/api-error';
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
  const { ApiError: ActualApiError } = jest.requireActual('../lib/api-error');
  return {
    ApiError: ActualApiError,
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

const preview = {
  readyCount: 1,
  duplicateCount: 0,
  invalidCount: 0,
  rows: [
    {
      rowNumber: 2,
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'in' as const,
      amountKobo: 100_000,
      note: 'Salary',
      fingerprint: 'a'.repeat(64),
      duplicate: false,
      error: null,
    },
  ],
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <ImportTransactionsScreen />
    </QueryClientProvider>,
  );

describe('transaction import screen errors', () => {
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
    mockPreview.mockResolvedValue(preview);
    mockConfirm.mockResolvedValue({ importedCount: 1, duplicateCount: 0 });
  });

  it('surfaces a file-read failure without starting preview', async () => {
    mockPick.mockRejectedValue(new Error('Permission denied'));
    await renderScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Choose transaction CSV file' }),
    );

    expect(
      await screen.findByRole('alert', { name: 'Permission denied' }),
    ).toBeOnTheScreen();
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('uses a generic file-read message when the picker throws a non-Error', async () => {
    mockPick.mockRejectedValue('disk missing');
    await renderScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Choose transaction CSV file' }),
    );

    expect(
      await screen.findByRole('alert', {
        name: 'Unable to read that CSV file.',
      }),
    ).toBeOnTheScreen();
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('shows the preview API error instead of a review list', async () => {
    mockPreview.mockRejectedValue(
      new ApiError({ message: 'CSV contains duplicate column names' }),
    );
    await renderScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Choose transaction CSV file' }),
    );

    expect(
      await screen.findByRole('alert', {
        name: 'CSV contains duplicate column names',
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Review before importing')).toBeNull();
  });

  it('shows the confirm API error after a valid preview selection', async () => {
    mockConfirm.mockRejectedValue(
      new ApiError({
        message: 'Only valid rows from the current preview can be imported',
      }),
    );
    await renderScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Choose transaction CSV file' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Import 1 selected' }),
    ).toBeEnabled();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Import 1 selected' }),
    );

    expect(
      await screen.findByRole('alert', {
        name: 'Only valid rows from the current preview can be imported',
      }),
    ).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(screen.queryByText('Import complete')).toBeNull();
  });

  it('includes API rowNumbers in the confirm failure message', async () => {
    mockConfirm.mockRejectedValue(
      new ApiError({
        message: 'Only valid rows from the current preview can be imported',
        details: { rowNumbers: [8, 2] },
      }),
    );
    await renderScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Choose transaction CSV file' }),
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Import 1 selected' }),
    );

    expect(
      await screen.findByRole('alert', {
        name: 'Only valid rows from the current preview can be imported (rows 8, 2).',
      }),
    ).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});
