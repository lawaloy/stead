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
import { sessionQueryKeys } from '../lib/session-query-cache';
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
  '2026-09-02,Bonus,500,income',
].join('\n');

const activeGoal = {
  id: 'goal_1',
  userId: 'user_1',
  name: 'Rent',
  amountTotalKobo: 1_000_000,
  dueDate: '2027-01-01T12:00:00.000Z',
  monthlyIncomeKobo: null,
  isActive: true,
  status: 'active' as const,
  endedAt: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};

describe('transaction import confirm all skipped success', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockPick.mockResolvedValue({ name: 'statement.csv', csv });
    mockGoal.mockResolvedValue(activeGoal);
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
          direction: 'in',
          amountKobo: 50_000,
          note: 'Bonus',
          fingerprint: 'b'.repeat(64),
          duplicate: false,
          error: null,
        },
      ],
    });
    mockConfirm.mockResolvedValue({ importedCount: 0, duplicateCount: 2 });
    queryClient.setQueryData(sessionQueryKeys.dashboard('session-token'), {
      ok: true,
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

  it('shows a zero-import success card when every selected row already existed', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

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
    expect(invalidateSpy).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Import 2 selected' }),
    );

    expect(await screen.findByText('Import complete')).toBeOnTheScreen();
    expect(
      screen.getByText('0 imported; 2 already existed and were skipped.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Review before importing')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: sessionQueryKeys.transactions('session-token'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: sessionQueryKeys.dashboard('session-token'),
      });
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: sessionQueryKeys.activeGoal('session-token'),
    });
  });
});
