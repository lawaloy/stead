import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Alert, Share } from 'react-native';
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
const mockExport = jest.mocked(exportAccountData);
const mockGet = jest.mocked(getAccount);
const mockConsents = jest.mocked(updateAccountConsents);
const mockProfile = jest.mocked(updateAccountProfile);

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AccountScreen />
    </QueryClientProvider>,
  );

describe('account and privacy screen', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(account);
    mockProfile.mockResolvedValue({
      ...account,
      profile: { ...account.profile, displayName: 'Grace' },
    });
    mockConsents.mockResolvedValue({
      ...account,
      consents: { ...account.consents, analyticsEnabled: true },
    });
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
    mockDelete.mockResolvedValue({
      ok: true,
      deletedAt: '2026-09-08T12:01:00.000Z',
    });
    logout.mockResolvedValue(undefined);
  });

  it('updates profile and optional consent choices', async () => {
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

    await fireEvent.press(
      screen.getByRole('switch', { name: 'Product analytics' }),
    );
    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Save consent choices' }),
      );
    });
    await waitFor(() =>
      expect(mockConsents).toHaveBeenCalledWith({
        analyticsEnabled: true,
        productResearchEnabled: false,
      }),
    );
  });

  it('preserves the loaded display name when saving without an edit', async () => {
    await renderScreen();
    await screen.findByDisplayValue('Ada');

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
    });

    await waitFor(() =>
      expect(mockProfile).toHaveBeenCalledWith({ displayName: 'Ada' }),
    );
  });

  it('prepares a shareable export and guards permanent deletion', async () => {
    await renderScreen();
    await screen.findByText('+2348012345678');
    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Export and share my data' }),
      );
    });
    await waitFor(() => expect(mockExport).toHaveBeenCalled());
    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Stead data export' }),
    );

    const deleteButton = screen.getByRole('button', {
      name: 'Delete account permanently',
    });
    expect(deleteButton).toBeDisabled();
    fireEvent.changeText(
      screen.getByLabelText('Delete account confirmation'),
      'DELETE',
    );
    const enabledDeleteButton = await screen.findByRole('button', {
      name: 'Delete account permanently',
    });
    await waitFor(() => expect(enabledDeleteButton).not.toBeDisabled());
    fireEvent.press(enabledDeleteButton);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Permanently delete account?',
      expect.any(String),
      expect.any(Array),
    );
    const actions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    await act(async () => {
      actions
        ?.find((action) => action.text === 'Delete permanently')
        ?.onPress?.();
    });
    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    expect(logout).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/(auth)/request-otp');
  });
});
