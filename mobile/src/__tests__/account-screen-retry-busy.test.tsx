import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AccountScreen from '../../app/(app)/account';
import {
  deleteAccount,
  exportAccountData,
  getAccount,
  updateAccountConsents,
  updateAccountProfile,
} from '../lib/api';
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

const renderScreen = (client: QueryClient) =>
  render(
    <QueryClientProvider client={client}>
      <AccountScreen />
    </QueryClientProvider>,
  );

describe('account screen retry busy guard', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
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
    jest.mocked(updateAccountConsents).mockResolvedValue({} as never);
    jest.mocked(updateAccountProfile).mockResolvedValue({} as never);
  });

  afterEach(async () => {
    await client.cancelQueries();
    client.clear();
  });

  it('disables retry while a background account refresh is in flight', async () => {
    client.setQueryData(sessionQueryKeys.account('session-token'), account, {
      updatedAt: 0,
    });
    mockGet.mockRejectedValue(new Error('Offline'));
    await renderScreen(client);

    expect(await screen.findByDisplayValue('Ada')).toBeOnTheScreen();
    expect(
      await screen.findByRole(
        'alert',
        {
          name: 'Could not refresh your account. Showing your last saved information.',
        },
        { timeout: 3_000 },
      ),
    ).toBeOnTheScreen();

    mockGet.mockImplementation(() => new Promise(() => undefined));
    // Do not await press: refetch returns the hanging getAccount promise.
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole(
        'button',
        { name: 'Retrying...' },
        { timeout: 3_000 },
      ),
    ).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByDisplayValue('Ada')).toBeOnTheScreen();
  });
});
