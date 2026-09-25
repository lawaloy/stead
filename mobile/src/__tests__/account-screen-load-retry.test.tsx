import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
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

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AccountScreen />
    </QueryClientProvider>,
  );

describe('account screen load failure', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    jest.mocked(deleteAccount).mockResolvedValue({
      ok: true,
      deletedAt: '2026-09-08T12:01:00.000Z',
    });
    jest.mocked(exportAccountData).mockResolvedValue({
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
    jest.mocked(updateAccountConsents).mockResolvedValue(account);
    jest.mocked(updateAccountProfile).mockResolvedValue(account);
  });

  it('shows a failed-load alert and recovers after retry', async () => {
    mockGet.mockRejectedValue(new Error('Offline'));
    await renderScreen();

    expect(
      await screen.findByRole(
        'alert',
        { name: 'Could not load your account.' },
        { timeout: 3_000 },
      ),
    ).toBeOnTheScreen();

    mockGet.mockResolvedValue(account);
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByLabelText('Display name')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Ada')).toBeOnTheScreen();
  });
});
