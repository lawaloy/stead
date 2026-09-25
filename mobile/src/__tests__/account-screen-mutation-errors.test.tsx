import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import AccountScreen from '../../app/(app)/account';
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

const mockGet = jest.mocked(getAccount);
const mockProfile = jest.mocked(updateAccountProfile);
const mockExport = jest.mocked(exportAccountData);

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AccountScreen />
    </QueryClientProvider>,
  );

describe('account screen mutation failures', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(account);
    mockProfile.mockResolvedValue(account);
    jest.mocked(updateAccountConsents).mockResolvedValue(account);
    mockExport.mockResolvedValue({
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
    });
    jest.mocked(deleteAccount).mockResolvedValue({
      ok: true,
      deletedAt: '2026-09-08T12:01:00.000Z',
    });
    logout.mockResolvedValue(undefined);
  });

  it('shows a shared failure banner when a profile save is rejected', async () => {
    mockProfile.mockRejectedValue(new Error('Offline'));
    await renderScreen();
    await screen.findByDisplayValue('Ada');

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
    });

    expect(
      await screen.findByRole('alert', {
        name: 'The account action failed. Check your connection and retry.',
      }),
    ).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });

  it('shows the same banner when export fails and does not log out', async () => {
    mockExport.mockRejectedValue(new Error('Offline'));
    await renderScreen();
    await screen.findByText('+2348012345678');

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Export and share my data' }),
      );
    });

    expect(
      await screen.findByRole('alert', {
        name: 'The account action failed. Check your connection and retry.',
      }),
    ).toBeOnTheScreen();
    expect(logout).not.toHaveBeenCalled();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});
