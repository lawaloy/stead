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
import type { AccountResponse } from '../contracts/generated/types.gen';
import {
  deleteAccount,
  exportAccountData,
  getAccount,
  updateAccountConsents,
  updateAccountProfile,
} from '../lib/api';
import { queryClient } from '../lib/query-client';
import { sessionQueryKeys } from '../lib/session-query-cache';

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

const loadedAccount: AccountResponse = {
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

const savedAccount: AccountResponse = {
  ...loadedAccount,
  profile: {
    ...loadedAccount.profile,
    displayName: 'Grace',
    updatedAt: '2026-09-08T12:00:00.000Z',
  },
};

const mockProfile = jest.mocked(updateAccountProfile);
const mockGet = jest.mocked(getAccount);

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AccountScreen />
    </QueryClientProvider>,
  );

describe('account screen profile query cache', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(loadedAccount);
    mockProfile.mockResolvedValue(savedAccount);
    jest.mocked(updateAccountConsents).mockResolvedValue(loadedAccount);
    jest.mocked(exportAccountData).mockResolvedValue({
      schemaVersion: 1,
      exportedAt: '2026-09-08T12:00:00.000Z',
      profile: loadedAccount.profile,
      consents: loadedAccount.consents,
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

  it('writes the saved profile into the session account cache', async () => {
    await renderScreen();
    const name = await screen.findByLabelText('Display name');
    await fireEvent.changeText(name, 'Grace');
    await waitFor(() => expect(name).toHaveProp('value', 'Grace'));

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
    });

    await waitFor(() =>
      expect(mockProfile).toHaveBeenCalledWith({ displayName: 'Grace' }),
    );
    expect(
      await screen.findByRole('alert', { name: 'Profile saved' }),
    ).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    expect(
      queryClient.getQueryData(sessionQueryKeys.account('session-token')),
    ).toEqual(savedAccount);
    expect(screen.getByLabelText('Display name')).toHaveProp('value', 'Grace');
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(logout).not.toHaveBeenCalled();
  });
});
