import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Share } from 'react-native';
import AccountScreen from '../../app/(app)/account';
import type { AccountDataExport } from '../contracts/generated/types.gen';
import {
  deleteAccount,
  exportAccountData,
  getAccount,
  updateAccountConsents,
  updateAccountProfile,
} from '../lib/api';
import { queryClient } from '../lib/query-client';

const replace = jest.fn();
const logout = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace }),
}));
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement('View', null, children),
  };
});
jest.mock('../lib/auth-state', () => ({
  useAuth: () => ({ token: 'session-token', logout }),
}));
jest.mock('../lib/api', () => ({
  deleteAccount: jest.fn(),
  exportAccountData: jest.fn(),
  getAccount: jest.fn(),
  updateAccountConsents: jest.fn(),
  updateAccountProfile: jest.fn(),
}));

const account = {
  profile: {
    id: 'user_1',
    phone: '+2348012345678',
    displayName: 'Ada',
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  },
  consents: {
    analyticsEnabled: false,
    productResearchEnabled: false,
    updatedAt: null,
  },
};

const exportPayload: AccountDataExport = {
  schemaVersion: 1,
  exportedAt: '2026-09-08T12:00:00.000Z',
  profile: account.profile,
  consents: account.consents,
  consentHistory: [],
  goals: [],
  transactions: [],
  alertPreferences: null,
  authHistory: [],
  notificationHistory: [],
};

const mockExport = jest.mocked(exportAccountData);
const mockGet = jest.mocked(getAccount);

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AccountScreen />
    </QueryClientProvider>,
  );

describe('account screen export share failure', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(account);
    mockExport.mockResolvedValue(exportPayload);
    jest.mocked(updateAccountProfile).mockResolvedValue(account);
    jest.mocked(updateAccountConsents).mockResolvedValue(account);
    jest.mocked(deleteAccount).mockResolvedValue({
      ok: true,
      deletedAt: '2026-09-08T12:01:00.000Z',
    });
    logout.mockResolvedValue(undefined);
    jest.mocked(Share.share).mockResolvedValue({
      action: 'sharedAction',
    });
  });

  afterEach(() => {
    jest.mocked(Share.share).mockResolvedValue({
      action: 'sharedAction',
    });
  });

  it('surfaces a share-sheet failure after a successful export and does not claim the export is prepared', async () => {
    jest
      .mocked(Share.share)
      .mockRejectedValue(new Error('Share sheet unavailable'));

    await renderScreen();
    await screen.findByText('+2348012345678');

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Export and share my data' }),
      );
    });

    await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(1));
    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Stead data export' }),
    );
    expect(
      await screen.findByRole('alert', {
        name: 'The account action failed. Check your connection and retry.',
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Data export prepared')).toBeNull();
    expect(logout).not.toHaveBeenCalled();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(
      screen.getByRole('button', { name: 'Export and share my data' }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Save profile' }),
    ).not.toBeDisabled();
  });
});
