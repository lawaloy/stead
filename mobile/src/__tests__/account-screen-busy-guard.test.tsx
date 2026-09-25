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

const mockDelete = jest.mocked(deleteAccount);
const mockExport = jest.mocked(exportAccountData);
const mockGet = jest.mocked(getAccount);

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AccountScreen />
    </QueryClientProvider>,
  );

describe('account screen busy guard', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(account);
    mockDelete.mockResolvedValue({
      ok: true,
      deletedAt: '2026-09-08T12:01:00.000Z',
    });
    jest.mocked(updateAccountProfile).mockResolvedValue(account);
    jest.mocked(updateAccountConsents).mockResolvedValue(account);
    logout.mockResolvedValue(undefined);
  });

  it('disables profile, consent, and delete actions while export is in flight', async () => {
    let resolveExport: ((value: AccountDataExport) => void) | undefined;
    mockExport.mockImplementation(
      () =>
        new Promise<AccountDataExport>((resolve) => {
          resolveExport = resolve;
        }),
    );

    await renderScreen();
    await screen.findByText('+2348012345678');
    fireEvent.changeText(
      screen.getByLabelText('Delete account confirmation'),
      'DELETE',
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Export and share my data' }),
      );
    });

    await waitFor(() => expect(mockExport).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Save consent choices' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Delete account permanently' }),
    ).toBeDisabled();
    expect(mockDelete).not.toHaveBeenCalled();

    await act(async () => {
      resolveExport?.(exportPayload);
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(Share.share).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Delete account permanently' }),
      ).not.toBeDisabled(),
    );
  });
});
