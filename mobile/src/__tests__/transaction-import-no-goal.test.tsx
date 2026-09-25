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
].join('\n');

describe('transaction import without an active goal', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockPick.mockResolvedValue({ name: 'statement.csv', csv });
    mockGoal.mockResolvedValue(null);
    mockPreview.mockResolvedValue({
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
    });
    mockConfirm.mockResolvedValue({ importedCount: 1, duplicateCount: 0 });
  });

  it('confirms selected rows without sending a goalId when no active goal exists', async () => {
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
      screen.queryByRole('checkbox', {
        name: /Link imported transactions/,
      }),
    ).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Import 1 selected' }),
    );

    await waitFor(() =>
      expect(mockConfirm).toHaveBeenCalledWith(
        {
          csv,
          rowNumbers: [2],
          goalId: undefined,
        },
        expect.any(Object),
      ),
    );
    expect(await screen.findByText('Import complete')).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});
