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

const account: AccountResponse = {
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

const mockConsents = jest.mocked(updateAccountConsents);
const mockGet = jest.mocked(getAccount);

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AccountScreen />
    </QueryClientProvider>,
  );

describe('account screen consent save busy guard', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(account);
    mockConsents.mockResolvedValue(account);
    jest.mocked(updateAccountProfile).mockResolvedValue(account);
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
      deletedAt: '2026-09-08T12:01:00.000Z',
    });
    logout.mockResolvedValue(undefined);
  });

  it('locks profile, export, and delete while consent save is in flight', async () => {
    let resolveConsents: ((value: AccountResponse) => void) | undefined;
    mockConsents.mockImplementation(
      () =>
        new Promise<AccountResponse>((resolve) => {
          resolveConsents = resolve;
        }),
    );

    await renderScreen();
    await screen.findByText('+2348012345678');
    fireEvent.press(screen.getByRole('switch', { name: 'Product analytics' }));
    fireEvent.changeText(
      screen.getByLabelText('Delete account confirmation'),
      'DELETE',
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText('Delete account confirmation').props.value,
      ).toBe('DELETE'),
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Save consent choices' }),
      );
    });

    await waitFor(() => {
      expect(mockConsents).toHaveBeenCalledTimes(1);
      expect(queryClient.isMutating()).toBeGreaterThan(0);
      expect(
        screen.getByRole('button', { name: 'Save profile' }),
      ).toBeDisabled();
    });
    expect(
      screen.getByRole('button', { name: 'Save consent choices' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Export and share my data' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Sign out of all devices' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Delete account permanently' }),
    ).toBeDisabled();
    expect(jest.mocked(updateAccountProfile)).not.toHaveBeenCalled();
    expect(jest.mocked(exportAccountData)).not.toHaveBeenCalled();
    expect(jest.mocked(deleteAccount)).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();

    await act(async () => {
      resolveConsents?.(account);
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Delete account permanently' }),
      ).not.toBeDisabled(),
    );
    expect(
      screen.getByRole('button', { name: 'Save profile' }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Export and share my data' }),
    ).not.toBeDisabled();
  });
});
