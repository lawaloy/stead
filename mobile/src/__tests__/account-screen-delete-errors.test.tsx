import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
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

const mockDelete = jest.mocked(deleteAccount);
const mockGet = jest.mocked(getAccount);

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AccountScreen />
    </QueryClientProvider>,
  );

describe('account screen delete failures', () => {
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
    mockDelete.mockRejectedValue(new Error('Offline'));
    logout.mockResolvedValue(undefined);
  });

  it('keeps the session when permanent deletion fails', async () => {
    await renderScreen();
    await screen.findByText('+2348012345678');

    fireEvent.changeText(
      screen.getByLabelText('Delete account confirmation'),
      'DELETE',
    );
    const deleteButton = await screen.findByRole('button', {
      name: 'Delete account permanently',
    });
    await waitFor(() => expect(deleteButton).not.toBeDisabled());
    fireEvent.press(deleteButton);

    const actions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    await act(async () => {
      actions
        ?.find((action) => action.text === 'Delete permanently')
        ?.onPress?.();
    });

    expect(
      await screen.findByRole('alert', {
        name: 'The account action failed. Check your connection and retry.',
      }),
    ).toBeOnTheScreen();
    expect(logout).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText('+2348012345678')).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});
