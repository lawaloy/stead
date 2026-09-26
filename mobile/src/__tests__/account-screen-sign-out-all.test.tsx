import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
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

describe('account screen sign out all devices', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(account);
    jest.mocked(updateAccountProfile).mockResolvedValue(account);
    jest.mocked(updateAccountConsents).mockResolvedValue(account);
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
    jest.mocked(deleteAccount).mockResolvedValue({
      ok: true,
      deletedAt: '2026-09-08T12:00:00.000Z',
    });
    logout.mockResolvedValue(undefined);
  });

  it('asks for confirmation before signing out of every device', async () => {
    const view = await renderScreen();
    await screen.findByText('+2348012345678');

    fireEvent.press(
      screen.getByRole('button', { name: 'Sign out of all devices' }),
    );

    expect(Alert.alert).toHaveBeenCalledWith(
      'Sign out of all devices?',
      expect.any(String),
      expect.any(Array),
    );
    const actions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    await act(async () => {
      await actions
        ?.find((action) => action.text === 'Sign out everywhere')
        ?.onPress?.();
    });

    expect(logout).toHaveBeenCalledWith({ allDevices: true });
    expect(replace).toHaveBeenCalledWith('/(auth)/request-otp');
    view.unmount();
  });

  it('keeps the session when the customer cancels sign out everywhere', async () => {
    await renderScreen();
    await screen.findByText('+2348012345678');

    fireEvent.press(
      screen.getByRole('button', { name: 'Sign out of all devices' }),
    );
    const actions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    await act(async () => {
      await actions?.find((action) => action.text === 'Cancel')?.onPress?.();
    });

    expect(logout).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
