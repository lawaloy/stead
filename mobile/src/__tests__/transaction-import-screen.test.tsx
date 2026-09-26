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
  '2026-09-01,Duplicate,50,expense',
  'bad,Invalid,20,expense',
].join('\n');

describe('transaction import screen', () => {
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
      readyCount: 1,
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
          occurredAt: '2026-09-01T12:00:00.000Z',
          direction: 'out',
          amountKobo: 5_000,
          note: 'Duplicate',
          fingerprint: 'b'.repeat(64),
          duplicate: true,
          error: null,
        },
        {
          rowNumber: 4,
          occurredAt: null,
          direction: 'out',
          amountKobo: 2_000,
          note: 'Invalid',
          fingerprint: null,
          duplicate: false,
          error: 'Date must use YYYY-MM-DD',
        },
      ],
    });
    mockConfirm.mockResolvedValue({ importedCount: 1, duplicateCount: 0 });
  });

  it('previews, selects, optionally goal-links, and confirms valid rows', async () => {
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
      screen.getByText(
        '1 ready to import · 1 already imported · 1 needs fixing',
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('checkbox', { name: 'CSV row 2 Salary' }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'CSV row 3 Duplicate' }),
    ).toBeDisabled();
    expect(screen.getByText('Already imported')).toBeOnTheScreen();
    expect(screen.getByText('Date must use YYYY-MM-DD')).toBeOnTheScreen();

    await fireEvent.press(
      await screen.findByRole('checkbox', {
        name: 'Link imported transactions to Rent',
      }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Import 1 selected' }),
    );

    await waitFor(() =>
      expect(mockConfirm).toHaveBeenCalledWith(
        {
          csv,
          rowNumbers: [2],
          goalId: 'goal_1',
        },
        expect.any(Object),
      ),
    );
    expect(await screen.findByText('Import complete')).toBeOnTheScreen();
    expect(
      screen.getByText('1 imported; 0 already existed and were skipped.'),
    ).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });

  it('lets the customer exclude a ready row before confirmation', async () => {
    await render(
      <QueryClientProvider client={queryClient}>
        <ImportTransactionsScreen />
      </QueryClientProvider>,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Choose transaction CSV file' }),
    );
    const readyRow = await screen.findByRole('checkbox', {
      name: 'CSV row 2 Salary',
    });
    await fireEvent.press(readyRow);

    expect(readyRow).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Import 0 selected' }),
    ).toBeDisabled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('clears an old preview while a replacement file is being previewed', async () => {
    await render(
      <QueryClientProvider client={queryClient}>
        <ImportTransactionsScreen />
      </QueryClientProvider>,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Choose transaction CSV file' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Import 1 selected' }),
    ).toBeEnabled();

    const replacementCsv = [
      'date,description,amount,type',
      '2026-09-02,Replacement,25,expense',
    ].join('\n');
    mockPick.mockResolvedValueOnce({
      name: 'replacement.csv',
      csv: replacementCsv,
    });
    let finishPreview!: (
      value: Awaited<ReturnType<typeof mockPreview>>,
    ) => void;
    mockPreview.mockReturnValueOnce(
      new Promise((resolve) => {
        finishPreview = resolve;
      }),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Choose transaction CSV file' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Review before importing')).toBeNull(),
    );
    expect(
      screen.queryByRole('button', { name: 'Import 1 selected' }),
    ).toBeNull();
    expect(mockConfirm).not.toHaveBeenCalled();

    finishPreview({
      readyCount: 1,
      duplicateCount: 0,
      invalidCount: 0,
      rows: [
        {
          rowNumber: 2,
          occurredAt: '2026-09-02T12:00:00.000Z',
          direction: 'out',
          amountKobo: 2_500,
          note: 'Replacement',
          fingerprint: 'c'.repeat(64),
          duplicate: false,
          error: null,
        },
      ],
    });
    expect(
      await screen.findByRole('checkbox', {
        name: 'CSV row 2 Replacement',
      }),
    ).toBeChecked();
  });
});
