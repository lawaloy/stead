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

const dashboardCache = { ok: true, metrics: { stabilityScore: 80 } };
const activityCache = [{ id: 'tx_existing' }];

describe('transaction import confirm cache failure', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockPick.mockResolvedValue({ name: 'statement.csv', csv });
    mockGoal.mockResolvedValue(activeGoal);
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
    mockConfirm.mockRejectedValue(
      new ApiError({
        message: 'Only valid rows from the current preview can be imported',
      }),
    );
    queryClient.setQueryData(
      sessionQueryKeys.dashboard('session-token'),
      dashboardCache,
    );
    queryClient.setQueryData(
      sessionQueryKeys.activeGoal('session-token'),
      activeGoal,
    );
    queryClient.setQueryData(
      sessionQueryKeys.transactions('session-token'),
      activityCache,
    );
  });

  it('does not refresh activity or dashboard when confirm is rejected', async () => {
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
    expect(screen.getByText('Review before importing')).toBeOnTheScreen();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData(sessionQueryKeys.dashboard('session-token')),
    ).toEqual(dashboardCache);
    expect(
      queryClient.getQueryData(sessionQueryKeys.transactions('session-token')),
    ).toEqual(activityCache);
    expect(
      queryClient.getQueryState(sessionQueryKeys.dashboard('session-token'))
        ?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(sessionQueryKeys.transactions('session-token'))
        ?.isInvalidated,
    ).toBe(false);
  });
});
